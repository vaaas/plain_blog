#!/usr/bin/env node
/* jshint -W083 */
/* jshint -W069 */
/* jshint -W010 */
/* jshint -W009 */

"use strict";

var http = require("http");
var fs = require("fs");
var url = require("url");
var dot = require("dot");
var pg = require("pg").native;

var conf = {
	http: {
		port: process.env.HTTP_PORT || 50000
	},
	auth: process.env.PASSWORD || "password",
	pg: {
		constring: process.env.PG_CONSTRING || "postgres://postgres:password@localhost/plain_blog"
	},
	dirs: {
		root: "/usr/local/share/blog",
	},
};

var template = null;

function pg_query (queryconf, callback) {
	pg.connect (conf.pg.constring, function (err, client, done) {
		if (err) {
			done();
			console.error ("error fetching client from pool", err);
			return callback (err);
		}
		client.query (queryconf, function (err, result) {
			done();
			if (err) {
				console.error ("error running query", err);
				return callback (err);
			}
			return callback (null, result);
		});
	});
}

function extract_request_data (req, callback) {
	var body = "";
	req.on ("data", function (data) {
		body += data;
	});
	req.on ("end", function () {
		return callback (body);
	});
}

function is_authorised (password) {
	if (!password) {
		return false;
	} else if (password === conf.auth) {
		return true;
	} else {
		return false;
	}
}

function code_response (num) {
	return {
		code: num,
		message: {"Content-type": "text/plain"},
		data: String (num)
	};
}

function serve_response (conf, res) {
	res.writeHead (conf.code, conf.message, conf.headers);
	res.end (conf.data);
}

function sql_generator (query) {
	if (!query) {
		return {
			text: "SELECT * FROM posts ORDER BY id LIMIT 10;",
			values: []
		};
	}

	var arr = new Array();
	var vals = new Array();
	var counter = 1;
	var id = null;
	var verb = "WHERE";
	var reverse = false;

	arr.push ("SELECT * FROM posts");
	if (query.category) {
		arr.push (verb + " $" + counter + " = ANY(categories)");
		vals.push(query.category);
		counter += 1;
		verb = "AND";
	}
	if (query.after) {
		id = parseInt (query.after, 10);
		if (id && id >= 1) {
			arr.push (verb + " id > $" + counter);
			vals.push (id);
			counter += 1;
		}
	} else if (query.prev) {
		id = parseInt (query.after, 10);
		if (id && id >= 1) {
			arr.push (verb + " id > $" + counter);
			vals.push (id);
			counter += 1;
			reverse = true;
		}
	}
	if (reverse) {
		arr.push ("ORDER BY id DESC");
	} else {
		arr.push ("ORDER BY id ASC");
	}

	arr.push ("LIMIT 10;");

	return {
		text: arr.join("\n"),
		values: vals
	};
}

function get_posts_collection (query, callback) {
	var qc = sql_generator (query);
	pg_query (qc, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else if (result.rowCount === 0) {
			return callback (code_response (404));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "text/html"},
				data: template ({
					type: "collection",
					category: (query && query.category) ? query.category : null,
					posts: result.rows
				})
			});
		}
	});
}

function get_posts_element (id, callback) {
	id = parseInt (id, 10);
	if (!id || id < 1) {
		return callback (code_response (400));
	}
	pg_query ({
		text: "SELECT * FROM posts WHERE id = $1;",
		values: [id]
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else if (result.rowCount === 0) {
			return callback (code_response (404));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "text/html"},
				data: template ({
					type: "element",
					post: result.rows[0]
				})
			});
		}
	});
}

function request_listener (req, res) {
	function DRY (conf) { serve_response (conf, res); }
	var purl = url.parse (req.url, true);
	var pathparts = purl.pathname.split ("/");

	switch (pathparts[1]) {
	case "admin":
		if (is_authorised (req.headers["x-password"])) {
			admin_request_listener (req, res);
		} else {
			serve_response (code_response (401), res);
		}
		break;
	case "posts":
		if (pathparts [2]) {
			get_posts_element (pathparts[2], DRY);
		} else {
			get_posts_collection (purl.query, DRY);
		}
		break;
	default:
		serve_response (code_response (400), res);
		break;
	}
}

function admin_get_posts_element (postid, callback) {
	var n = parseInt (postid, 10);
	if (!n || n < 1) {
		return callback (code_response (400));
	}
	pg_query ({
		text: "SELECT * FROM posts WHERE id = $1;",
		values: [n]
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else if (result.rowCount === 0) {
			return callback (code_response (404));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (result.rows[0])
			});
		}
	});
}

function admin_put_posts_element (postid, data, callback) {
	var n = parseInt (postid, 10);
	var obj = null;
	try {
		obj = JSON.parse(data);
	} catch (err) {
		return callback (code_response (400));
	}
	if (!n || n < 1 || !obj) {
		return callback (code_response (400));
	}
	pg_query ({
		text: "UPDATE posts SET title=$1, categories=$2, contents = $3, WHERE id = $4;",
		values: [obj.title, obj.categories, obj.contents, n]
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (result)
			});
		}
	});
}

function admin_delete_posts_element (postid, callback) {
	var n = parseInt (postid, 10);
	if (!n || n < 1) {
		return callback (code_response (400));
	}
	pg_query ({
		text: "DELETE FROM posts WHERE id = $1;",
		values: [n]
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (result)
			});
		}
	});
}

function admin_get_posts_collection (callback) {
	pg_query ({
		text: "SELECT id, published, title FROM posts ORDER BY id;",
		values: []
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (result.rows)
			});
		}
	});
}

function admin_post_posts_collection (data, callback) {
	var obj = null;
	try {
		obj = JSON.parse(data);
	} catch (err) {
		return callback (code_response (400));
	}
	if (!obj) {
		return callback (code_response (400));
	}
	pg_query ({
		text: "INSERT INTO posts (title, published, categories, blurb, contents) VALUES ($1, CURRENT_DATE, $2, $3, $4);",
		values: [obj.title, obj.categories, obj.blurb, obj.contents]
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (result)
			});
		}
	});
}

function admin_get_files_collection (callback) {
	fs.readdir (conf.dirs.root + "/static", function (err, files) {
		if (err) {
			console.error ("Error reading directory", err);
			return callback (code_response(500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (files)
			});
		}
	});
}

function admin_post_files_collection (data, callback) {
	var obj = null;
	try {
		obj = JSON.parse(data);
	} catch (err) {
		return callback (code_response (400));
	}
	for (var i = 0, len = obj.length; i < len; i++) {
		try {
			var fd = fs.openSync (conf.dirs.root + "/static/" + obj[i].name, "w", 288);
			var buf = new Buffer (obj[i].data, "base64");
			fs.writeSync (fd, buf, 0, buf.length, null);
			fs.closeSync (fd);
		} catch (err) {
			console.error ("Error writing file", err);
			return callback (code_response (500));
		}
	}
	return callback (code_response (200));
}

function admin_delete_files_element (file, callback) {
	fs.unlink (conf.dirs.root + "/static/" + file, function (err) {
		if (err) {
			console.error ("Error deleting file", err);
			return callback (code_response (400));
		} else {
			return callback (code_response (200));
		}
	});
}

function admin_preview (data, callback) {
	var obj = null;
	try {
		obj = JSON.parse (data);
	} catch (err) {
		return callback (code_response (400));
	}
	return callback ({
		code: 200,
		message: {"Content-type": "text/html"},
		data: template ({
			type: "element",
			post: obj
		})
	});
}

function admin_request_listener (req, res) {
	function DRY (conf) { serve_response (conf, res); }
	var purl = url.parse (req.url, true);
	var pathparts = purl.pathname.split ("/");

	switch (pathparts[2]) {
	case "posts":
		if (pathparts[3]) {
			// /admin/posts/postid
			switch (req.method) {
			case "GET":
				admin_get_posts_element (pathparts[3], DRY);
				break;
			case "PUT":
				extract_request_data (req, function (data) {
					admin_put_posts_element (pathparts[3], data, DRY);
				});
				break;
			case "DELETE":
				admin_delete_posts_element (pathparts[3], DRY);
				break;
			default:
				serve_response (code_response (405), res);
				break;
			}
		} else {
			// /admin/posts
			switch (req.method) {
			case "GET":
				admin_get_posts_collection (DRY);
				break;
			case "POST":
				extract_request_data (req, function (data) {
					admin_post_posts_collection (data, DRY);
				});
				break;
			default:
				serve_response (code_response (405), res);
				break;
			}
		}
		break;
	case "files":
		if (pathparts[3]) {
			switch (req.method) {
			case "DELETE":
				admin_delete_files_element (pathparts[3], DRY);
				break;
			default:
				serve_response (code_response (405), res);
				break;
			}
		} else {
			switch (req.method) {
			case "GET":
				admin_get_files_collection (DRY);
				break;
			case "POST":
				extract_request_data (req, function (data) {
					admin_post_files_collection (data, DRY);
				});
				break;
			default:
				serve_response (code_response (405), res);
				break;
			}
		}
		break;
	case "preview":
		if (req.method === "POST") {
			extract_request_data (req, function (data) {
				admin_preview (data, DRY);
			});
		} else {
			serve_response (code_response (405), res);
		}
		break;
	case "auth":
		if (req.method === "GET") {
			serve_response (code_response (200), res);
		} else {
			serve_response (code_response (405), res);
		}
		break;
	default:
		serve_response (code_response (400), res);
		break;
	}
}

function main () {
	template = dot.template (
		fs.readFileSync (
			conf.dirs.root + "/template.html",
			{"encoding": "utf-8"}
		)
	);
	var server = http.createServer();
	server.on ("request", request_listener);
	server.listen (conf.http.port, "127.0.0.1");
}

main();
