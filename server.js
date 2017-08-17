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
		if (err) console.log(err);
		db.query("SELECT * FROM gantt_links", function (err, links) {
			if (err) console.log(err);

			for (var i = 0; i < rows.length; i++) {
				rows[i].start_date = rows[i].start_date.format("YYYY-MM-DD");
				rows[i].open = true;
			}

			// sort 'rows' by 'sortorder' field

			rows.sort(function(a, b) {
				return a.sortorder - b.sortorder;
			});

			res.send({ data: rows, collections: { links: links } });
		});
	});
});

app.post("/data/task", function (req, res) { // adds new task to database
	var task = getTask(req.body);	

	db.query("SELECT MAX(sortorder) AS sortorder FROM gantt_tasks", function(err, result) {
		var orderIndex = 1;
		if(err) 
			console.log(err);
		if(result[0].sortorder !== null)
			orderIndex = result[0].sortorder + 1; // new task has a last order number or 0 if no tasks exist
		db.query("INSERT INTO gantt_tasks(text, start_date, duration, progress, parent, sortorder) VALUES (?,?,?,?,?,?)",
		[task.text, task.start_date, task.duration, task.progress, task.parent, orderIndex],
		function (err, result) {
			sendResponse(res, "inserted", result ? result.insertId : null, err);
		});
	});

});

app.put("/data/task/:id", function (req, res) { // updates task in database, recieving target when mooving
	var sid = req.params.id,
		target = req.body.target,
		currIndexOrder,
		task = getTask(req.body);
	
	if(target !== undefined) {
		var isNext = false;
		if(target.startsWith('next:')) {
			target = target.substr(5);
			isNext = true;
		}
		db.query('SELECT * FROM gantt_tasks WHERE id='+target, function(err, result) {
			//console.log(result, target)
			if(err) 
				console.log(err);
			currIndexOrder = result[0].sortorder;

			db.query('SELECT * FROM gantt_tasks', function(err, rows) {
				var min = rows[0].sortorder,
					max = rows[0].sortorder;


				rows.forEach(function(x) {
					console.log(x)
					if (min > x.sortorder)
						min = x.sortorder;
					if (max < x.sortorder)
						max = x.sortorder;
				}); // min & max among sortorder values
				//console.log(min, max)
				var minNearest = min,
					maxNearest = max,
					maxDelta = max - currIndexOrder,
					minDelta = currIndexOrder - min;

				rows.forEach(function(x) {
					var temp = x.sortorder;
					if (currIndexOrder > temp && currIndexOrder-temp < minDelta) {
						minNearest = temp;
						minDelta = currIndexOrder - temp;
					}

					if (currIndexOrder < temp && temp-currIndexOrder < maxDelta) {
						maxNearest = temp;
						maxDelta = temp - currIndexOrder;
					}

				});

				if (isNext) {
					if (currIndexOrder == max)
						currIndexOrder++;
					else 
						currIndexOrder = (currIndexOrder + maxNearest)*0.5;
				} else {
					if (currIndexOrder == min)
						currIndexOrder = currIndexOrder*0.5;
					else 
						currIndexOrder = (currIndexOrder + minNearest)*0.5;
				}
			})
		})

		db.query("UPDATE gantt_tasks SET text = ?, start_date = ?, duration = ?, progress = ?, parent = ?, sortorder = ? WHERE id = ?",
			[task.text, task.start_date, task.duration, task.progress, task.parent, currIndexOrder, sid],
			function (err, result) {
				sendResponse(res, "updated", null, err);
			});

	} else {

		db.query("UPDATE gantt_tasks SET text = ?, start_date = ?, duration = ?, progress = ?, parent = ? WHERE id = ?",
			[task.text, task.start_date, task.duration, task.progress, task.parent, sid],
			function (err, result) {
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