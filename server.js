var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
require("date-format-lite");

var port = 1337;
var app = express();
var mysql = require('mysql');
var db = mysql.createConnection({
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'gantt'
});

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/data", function (req, res) {
	db.query("SELECT * FROM gantt_tasks", function (err, rows) {
		if (err) 
			console.log(err);
		db.query("SELECT * FROM gantt_links", function (err, links) {
			if (err) console.log(err);

			for (var i = 0; i < rows.length; i++) {
				rows[i].start_date = rows[i].start_date.format("YYYY-MM-DD");
				rows[i].open = true;
			}

			rows.sort(function(a, b) {
				return a.sortorder - b.sortorder;
			});

			res.send({ data: rows, collections: { links: links } });
		});
	});
});

app.post("/data/task", function (req, res) { // adds new task to database
	var task = getTask(req.body);	

	db.query("SELECT MAX(sortorder) AS maxOrder FROM gantt_tasks", function(err, result) {		
		if(err) 
			console.log(err);
		var orderIndex = 0;
		if(result[0].maxOrder !== null)
			orderIndex = result[0].maxOrder + 1; // new task has a last order number or 0 if no tasks exist
		db.query("INSERT INTO gantt_tasks(text, start_date, duration, progress, parent, sortorder) VALUES (?,?,?,?,?,?)",
		[task.text, task.start_date, task.duration, task.progress, task.parent, orderIndex],
		function (err, result) {
			sendResponse(res, "inserted", result ? result.insertId : null, err);
		});
	});

});

app.put("/data/task/:id", function (req, res) {
	var sid = req.params.id,
		target = req.body.target,
		task = getTask(req.body);

	if (target !== undefined) {
		var nextTask = false;
		if(target.startsWith("next:")) {
			target = target.substr(5);
			nextTask = true;
		}

		db.query("SELECT * FROM gantt_tasks WHERE id = ?", [target], function(err, result) { // select the base task
			if (err)
				console.log(err);
			var targetOrder = result[0].sortorder;
			if(nextTask)
				targetOrder++;
			db.query("UPDATE gantt_tasks SET sortorder = sortorder + 1 WHERE sortorder >= ?", [targetOrder], function(err, result) {
				if (err)
					console.log(err);
				db.query("UPDATE gantt_tasks SET text = ?, start_date = ?, duration = ?, progress = ?, parent = ?, sortorder = ? WHERE id = ?",
					[task.text, task.start_date, task.duration, task.progress, task.parent, targetOrder, sid],
					function(err, result) {
						sendResponse(res, "updated", null, err);
					});
			});
		});

	} else {
		
		db.query("UPDATE gantt_tasks SET text = ?, start_date = ?, duration = ?, progress = ?, parent = ? WHERE id = ?",
			[task.text, task.start_date, task.duration, task.progress, task.parent, sid],
			function(err, result) {
				sendResponse(res, "updated", null, err);
			});	
	}
});

app.delete("/data/task/:id", function (req, res) {
	var sid = req.params.id;
	db.query("DELETE FROM gantt_tasks WHERE id = ?", [sid],
		function (err, result) {
			sendResponse(res, "deleted", null, err);
		});
});

app.post("/data/link", function (req, res) {
	var link = getLink(req.body);

	db.query("INSERT INTO gantt_links(source, target, type) VALUES (?,?,?)",
		[link.source, link.target, link.type],
		function (err, result) {
			sendResponse(res, "inserted", result ? result.insertId : null, err);
		});
});

app.put("/data/link/:id", function (req, res) {
	var sid = req.params.id,
		link = getLink(req.body);

	db.query("UPDATE gantt_links SET source = ?, target = ?, type = ? WHERE id = ?",
		[link.source, link.target, link.type, sid],
		function (err, result) {
			sendResponse(res, "updated", null, err);
		});
});

app.delete("/data/link/:id", function (req, res) {
	var sid = req.params.id;
	db.query("DELETE FROM gantt_links WHERE id = ?", [sid],
		function (err, result) {
			sendResponse(res, "deleted", null, err);
		});
});


function getTask(data) {
	return {
		text: data.text,
		start_date: data.start_date.date("YYYY-MM-DD"),
		duration: data.duration,
		progress: data.progress || 0,
		parent: data.parent
	};
}

function getLink(data) {
	return {
		source: data.source,
		target: data.target,
		type: data.type
	};
}

function sendResponse(res, action, tid, error) {
	if (error) {
		console.log(error);
		action = "error";
	}

	var result = {
		action: action
	};
	if (tid !== undefined && tid !== null)
		result.tid = tid;

	res.send(result);
}


app.listen(port, function () {
	console.log("Server is running on port " + port + "...");
});