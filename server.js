var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
require("date-format-lite");

var port = 1337;
var app = express();
var mysql = require('promise-mysql');
var db = mysql.createPool({
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'gantt'
});

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/data", function (req, res) {
	var rows;
	db.query("SELECT * FROM gantt_tasks")
		.then (function (result) {
			rows = result;
			return db.query("SELECT * FROM gantt_links");
		})
		.then (function (links) {

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

app.post("/data/task", function (req, res) { // adds new task to database
	var task = getTask(req.body);	

	db.query("SELECT MAX(sortorder) AS maxOrder FROM gantt_tasks")
		.then (function(result) {	
			var orderIndex = 0;
			if(result[0].maxOrder !== null)
				orderIndex = result[0].maxOrder + 1; // new task has a last order number or 0 if no tasks exist
			return db.query("INSERT INTO gantt_tasks(text, start_date, duration, progress, parent, sortorder) VALUES (?,?,?,?,?,?)",
				[task.text, task.start_date, task.duration, task.progress, task.parent, orderIndex]);
		})
		.then (function (result) {
			sendResponse(res, "inserted", result ? result.insertId : null);
		});
});

app.put("/data/task/:id", function (req, res) {
	var sid = req.params.id,
		target = req.body.target,
		targetOrder,
		task = getTask(req.body);

	if (target) {
		var nextTask = false;
		if(target.startsWith("next:")) {
			target = target.substr("next:".length);
			nextTask = true;
		}

		db.query("SELECT * FROM gantt_tasks WHERE id = ?", [target])
			.then (function(result) { 
				targetOrder = result[0].sortorder;
				if(nextTask)
					targetOrder++;
				return db.query("UPDATE gantt_tasks SET sortorder = sortorder + 1 WHERE sortorder >= ?", [targetOrder]);
			})
			.then (function(result) {				
				return db.query("UPDATE gantt_tasks SET text = ?, start_date = ?, duration = ?, progress = ?, parent = ?, sortorder = ? WHERE id = ?",
					[task.text, task.start_date, task.duration, task.progress, task.parent, targetOrder, sid]);
			})
			.then (function(result) {
					sendResponse(res, "updated", null);
			});

	} else {		
		db.query("UPDATE gantt_tasks SET text = ?, start_date = ?, duration = ?, progress = ?, parent = ? WHERE id = ?",
			[task.text, task.start_date, task.duration, task.progress, task.parent, sid])
			.then (function(result) {
				sendResponse(res, "updated", null);
			});	
	}
});

app.delete("/data/task/:id", function (req, res) {
	var sid = req.params.id;
	db.query("DELETE FROM gantt_tasks WHERE id = ?", [sid])
		.then (function (result) {
			sendResponse(res, "deleted", null);
		});
});

app.post("/data/link", function (req, res) {
	var link = getLink(req.body);

	db.query("INSERT INTO gantt_links(source, target, type) VALUES (?,?,?)", [link.source, link.target, link.type])
		.then (function (result) {
			sendResponse(res, "inserted", result ? result.insertId : null);
		});
});

app.put("/data/link/:id", function (req, res) {
	var sid = req.params.id,
		link = getLink(req.body);

	db.query("UPDATE gantt_links SET source = ?, target = ?, type = ? WHERE id = ?", [link.source, link.target, link.type, sid])
		.then (function (result) {
			sendResponse(res, "updated", null);
		});
});

app.delete("/data/link/:id", function (req, res) {
	var sid = req.params.id;
	db.query("DELETE FROM gantt_links WHERE id = ?", [sid])
		.then (function (result) {
			sendResponse(res, "deleted", null);
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

function sendResponse(res, action, tid) {

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