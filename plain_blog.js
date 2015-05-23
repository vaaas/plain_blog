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
		static: process.env.DIR_STATIC || "/usr/local/share/blog/static",
		templates: process.env.DIR_TEMPLATES || "/usr/local/share/blog/templates"
	},
};

var templates = new Object();

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
			callback (null, result);
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
	//todo
}

function get_posts_collection (query, callback) {
	var qc = sql_generator (query);
	pg_query (qc, function (err, result) {
		if (err) {
			console.error (err);
			return callback (code_response (500));
		} else {
			callback ({
				code: 200,
				message: {"Content-type": "text/html"},
				data: JSON.stringify (templates["posts"] ({
					category: query.category ? query.category : null,
					first: query.before ? true : false,
					last: result.rowCount === 10 ? true : false,
					first
					posts: result.rows
				}))
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
		get_posts_collection (url.query, DRY);
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
				data: JSON.stringify ({
					type: "posts element",
					data: result.rows[0]
				})
			});
		}
	});
}

function admin_put_posts_element (postid, data, callback) {
	var n = parseInt (postid, 10);
	var obj = JSON.parse(obj);
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
				data: JSON.stringify ({
					type: "message",
					data: result
				})
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
				data: JSON.stringify ({
					type: "message",
					data: result
				})
			});
		}
	});
}

function admin_get_posts_collection (callback) {
	pg_query ({
		text: "SELECT * FROM posts ORDER BY id;",
		values: []
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify ({
					type: "posts collection",
					data: result.rows
				})
			});
		}
	});
}

function admin_post_posts_collection (data, callback) {
	var obj = JSON.parse(data);
	if (!obj) {
		return callback (code_response(400));
	}
	pg_query ({
		text: "INSERT INTO posts (title, published, categories, contents) VALUES ($1, CURRENT_DATE, $2, $3);",
		values: [obj.title, obj.categories, obj.contents]
	}, function (err, result) {
		if (err) {
			return callback (code_response (500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify ({
					type: "message",
					data: result
				})
			});
		}
	});
}

function admin_get_files_collection (callback) {
	fs.readdir (conf.dirs.static, function (err, files) {
		if (err) {
			console.error (err);
			return callback (code_response(500));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify ({
					type: "files collection",
					data: files
				})
			});
		}
	});
}

function admin_post_files_collection (data, callback) {
	var obj = JSON.parse(data);
	if (!obj) {
		return callback (code_response(400));
	}
	for (var i = 0, len = obj.length; i < len; i++) {
		try {
			var fd = fs.openSync (conf.dirs.static + "/" + obj[i].name, "w", 288);
			var buf = new Buffer (obj[i].data, "base64");
			fs.writeSync (fd, buf, 0, buf.length, null);
			fs.closeSync (fd);
		} catch (e) {
			console.error (e);
			return callback (code_response (500));
		}
	}
	return callback (code_response (200));
}

function admin_delete_files_element (file, callback) {
	console.log ("deleting something!");
	fs.unlink (conf.dirs.static + "/" + file, function (err) {
		if (err) {
			console.error (err);
			return callback (code_response (400));
		} else {
			return callback (code_response (200));
		}
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
		// todo
		break;
	case "auth":
		// todo
		break;
	default:
		serve_response (code_response (400), res);
		break;
	}
}

function compile_templates () {
	var files = fs.readdirSync (conf.dirs.templates);
	for (var i = 0, len = files.length; i < len; i++) {
		templates[files[i]] = dot.template (
			fs.readFileSync (
				files[i], {"encoding": "utf-8"}
			)
		);
	}
}

function main () {
	compile_templates ();
	var server = http.createServer();
	server.on ("request", request_listener);
	server.listen (conf.http.port, "127.0.0.1");
}

main();
