#!/usr/bin/env node
/* jshint -W009 */
/* jshint -W010 */
/* jshint -W069 */
/* jshint -W083 */

"use strict";

var http = require("http");
var fs = require("fs");
var url = require("url");
var dot = require("dot");
var pg = require("pg").native;

// configuration object
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

// template function
var template = dot.template (
	fs.readFileSync (
		conf.dirs.root + "/template.html",
		{"encoding": "utf-8"}
	)
);

// execute a postgres query
// queryconf: a node-pg query configuration object
// callback (err, result): function to call when the query completes
// returns nothing
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

// extract data sent by a POST or PUT request
// req: node.js http request object
// callback (data): function to call when extraction completes
// returns nothing
function extract_request_data (req, callback) {
	var body = "";
	req.on ("data", function (data) {
		body += data;
	});
	req.on ("end", function () {
		return callback (body);
	});
}

// check whether the password provided matches the administrator password
// password: the password received
// returns bool
function is_authorised (password) {
	if (!password) {
		return false;
	} else if (password === conf.auth) {
		return true;
	} else {
		return false;
	}
}

function isInt (n) {
	return n % 1 === 0;
}

function is_valid_post (obj) {
	if (
		typeof obj === "object" ||
		typeof obj.id === "number" ||
		typeof obj.title === "string" ||
		obj.title.length > 0 ||
		! new Date (obj.published).getTime().isNaN() ||
		typeof obj.contents === "string" ||
		obj.contents.length > 0
	) {
		return true;
	} else {
		return false;
	}
}

// create a very simple response configuration object
// num: number of the response code
// returns a response configuration object
function code_response (num, msg) {
	return {
		code: num,
		message: {"Content-type": "text/plain"},
		data: msg ? msg : "" + num
	};
}

function sane_error (err) {
	return "Something went wrong:\n\n["+err.name+"] " + err.message;
}

// serve a response
// conf: a response configuration object
// res: node.js http response object
// returns nothing
function serve_response (conf, res) {
	res.writeHead (conf.code, conf.message, conf.headers);
	res.end (conf.data);
}

// generate a node-pg query configuration object based on a user query
// query: the user query
// returns a node-pg query configuration object
function sql_generator (query) {
	// check if query is empty
	if (
		typeof query !== "object" || (
			(query.category === undefined || query.category.length === 0) &&
			(query.after === undefined || query.after.length === 0) &&
			(query.prev === undefined || query.prev.length === 0)
		)
	) {
		return {
			text: "SELECT * FROM posts ORDER BY id LIMIT 10;",
			values: []
		};
	}

	var arr = new Array(); // array of lines
	var vals = new Array(); // array of values for the queryconf object
	var counter = 1; // counter of values inserted so far
	var id = null; // the maximum / minimum id queried against
	var verb = "WHERE"; // verb to use when starting a query
	var rev = false; // whether to use reverse sorting
	
	// we'll push lines to arr and parameters (if any) to vals
	arr.push ("SELECT * FROM posts");
	if (query.category) {
		// the user is requesting posts in a specific category
		arr.push (verb + " $" + counter + " = ANY(categories)");
		vals.push(query.category);
		counter += 1;
		// further searches should be combined with AND
		verb = "AND";
	}
	// the user can ask for one of two things:
	// posts after a specific id
	// or posts before a specific id
	if (query.after) {
		id = parseInt (query.after, 10);
		if (id && isInt (id) && id >= 1) {
			arr.push (verb + " id > $" + counter);
			vals.push (id);
			counter += 1;
		}
	} else if (query.prev) {
		id = parseInt (query.prev, 10);
		if (id && isInt (id) && id >= 1) {
			arr.push (verb + " id > $" + counter);
			vals.push (id);
			counter += 1;
			rev = true;
		}
	}
	// if the user asked for posts before an id, reverse the order so that
	// the user sees them in the correct order
	if (rev) {
		arr.push ("ORDER BY id DESC");
	} else {
		arr.push ("ORDER BY id ASC");
	}

	// a sensible post limit for a regular blog
	arr.push ("LIMIT 10;");

	return {
		text: arr.join("\n"),
		values: vals
	};
}

// render the page for GET /posts
// query: the user query object
// callback (res_conf): the function to call when the response is ready
// returns nothing
// on success, serves HTML content (200)
// if query is invalid, serves plain text (400)
// if nothing is found, serves empty (404)
// if something goes wrong with the query, serves plain text (500)
function get_posts_collection (query, callback) {
	var qc = sql_generator (query);
	if (!qc) {
		return callback (code_response (400, "Invalid query"));
	}
	pg_query (qc, function (err, result) {
		if (err) {
			// something went wrong
			return callback (code_response (500, sane_error(err)));
		} else if (result.rowCount === 0) {
			// no results
			return callback (code_response (404));
		}
		// the response object
		return callback ({
			code: 200,
			message: {"Content-type": "text/html"},
			data: template ({ // render the page
				type: "collection",
				category: (query && query.category) ? query.category : null,
				posts: result.rows
			})
		});
	});
}

// render the page for GET /posts/postid
// id: the post id
// callback (res_conf): the function to call when the response is ready
// returns nothing
// on success, serves HTML content (200)
// if query is invalid, serves plain text (400)
// if something goes wrong with the query, serves plain text (500)
function get_posts_element (id, callback) {
	id = parseInt (id, 10);
	if (!id || !isInt (id) || id < 1) {
		// the user has intentionally requested an invalid post
		return callback (code_response (400, "Please stop that"));
	}
	pg_query ({
		text: "SELECT * FROM posts WHERE id = $1;",
		values: [id]
	}, function (err, result) {
		if (err) {
			// something went wrong
			return callback (code_response (500, sane_error(err)));
		} else if (result.rowCount === 0) {
			// post not found
			return callback (code_response (404));
		}
		// the response object
		return callback ({
			code: 200,
			message: {"Content-type": "text/html"},
			data: template ({ // render the page
				type: "element",
				post: result.rows[0]
			})
		});
	});
}

// main http listener function
// wait for requests and handle them appropriately
// req: node.js http request object
// res: node.js http response object
// returns nothing
// serves whatever the called functions serve
// if a function is not found, serves empty (404)
// if a method is not allowed, serves plain text (405)
function request_listener (req, res) {
	// a simple function to help with not repeating oneself
	function DRY (conf) { serve_response (conf, res); }
	// parse the url and delimit the directories
	var purl = url.parse (req.url, true);
	var pathparts = purl.pathname.split ("/");

	switch (pathparts[1]) {
	case "admin":
		// private API for the administrator requires proper authentication
		// password is sent through the "x-password" header
		if (is_authorised (req.headers["x-password"])) {
			admin_request_listener (req, res);
		} else {
			serve_response (code_response (401, "Not authorised"), res);
		}
		break;
	case "posts":
		// public api for reading posts
		if (req.method !== "GET") {
			// guests can do nothing but read posts
			serve_response (code_response (405, "Only GET methods allowed"));
		} else if (pathparts [2]) {
			// GET /posts/postid
			// render a single post
			get_posts_element (pathparts[2], DRY);
		} else {
			// GET /posts
			// render a list / summary of several posts
			get_posts_collection (purl.query, DRY);
		}
		break;
	default:
		serve_response (code_response (404), res);
		break;
	}
}

// get a blog post
// postid: id of the post to get
// callback: function to call when retrieval completes
// returns nothing
function admin_get_posts_element (postid, callback) {
	var n = parseInt (postid, 10);
	if (!n || !isInt (n) || n < 1) {
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

// replace a blog post
// postid: the post to replace
// data: contents and metadata of the post
// callback: function to call when replacement completes
// returns nothing
function admin_put_posts_element (postid, data, callback) {
	// input verification
	var n = parseInt (postid, 10);
	if (!n || !isInt (n) || n < 1) {
		return callback (code_response (400, "Invalid post number"));
	}
	var obj;
	try {
		obj = JSON.parse (data);
	} catch (err) {
		return callback (code_response (400));
	}
	if (! is_valid_post (obj)) {
		return callback (code_response (400, "Invalid data"));
	}
	pg_query ({
		text: "UPDATE posts SET title=$1, categories=$2, contents=$3, WHERE id=$4;",
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

// delete a blog post
// postid: the id of the post to delete
// callback: function to call when deletion completes
// returns nothing
function admin_delete_posts_element (postid, callback) {
	var n = parseInt (postid, 10);
	if (!n || !isInt (n) ||  n < 1) {
		return callback (code_response (400, "Invalid post number"));
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

// get a list of all blog posts
// callback: function to call when the list has been generated
// returns nothing
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

// create a blog post
// data: contents and metadata of the blog post
// callback: function to call when the post has been inserted
// returns nothing
// on success, serves empty (201)
// on invalid user data, serves plain text (400)
// on error running query, serves plain text (500)
function admin_post_posts_collection (data, callback) {
	// input verification
	var obj;
	try {
		obj = JSON.parse (data);
	} catch (err) {
		return callback (code_response (400, sane_error (err)));
	}
	if (! is_valid_post (obj)) {
		return callback (code_response (400, "Invalid data"));
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

// get a list of files
// callback: function to call when the list has been generated
// returns nothing
// on success, serves json (200)
// on error, serves plain text (500)
function admin_get_files_collection (callback) {
	fs.readdir (conf.dirs.root + "/static", function (err, files) {
		if (err) {
			return callback (code_response (500, sane_error (err)));
		} else {
			return callback ({
				code: 200,
				message: {"Content-type": "application/json"},
				data: JSON.stringify (files)
			});
		}
	});
}

// create a static file
// data: an object containing file contents and metadata
// callback: function to call when creation completes
// returns nothing
// on success, serves empty (201)
// on invalid user data, serves plain text (400)
// on write error, serves plain text (500)
function admin_post_files_collection (data, callback) {
	var obj;
	try {
		obj = JSON.parse(data);
	} catch (err) {
		return callback (code_response (500, sane_error (err)));
	}
	
	if (obj instanceof Array === false) {
		return callback (code_response (400, "Need array, not " + typeof obj));
	}
	
	for (var i = 0, len = obj.length; i < len; i++) {
		if (
			typeof obj[i].name !== "string" ||
			obj[i].name.length === 0 ||
			typeof obj[i].data !== "string" ||
			obj[i].data === 0
		) {
			return callback (code_response (400, "Invalid data"));
		}
		var fd;
		try {
			fd = fs.openSync (conf.dirs.root + "/static/" + obj[i].name, "w", 288);
		} catch (err) {
			return callback (code_response (500, "Error opening file\n" + sane_error (err)));
		}
		var buf = new Buffer (obj[i].data, "base64");
		try {
			fs.writeSync (fd, buf, 0, buf.length, null);
		} catch (err) {
			return callback (code_response (500, "Error writing to file\n" + sane_error (err)));
		}
		try {
			fs.closeSync (fd);
		} catch (err) {
			return callback (code_response (500, "Error closing file\n" + sane_error (err)));
		}
	}
	return callback (code_response (201));
}

// delete a static file
// file: the file name
// callback: function to call when deletion finishes
// returns nothing
// on success, serves empty (204)
// on failure, serves plain text (500)
function admin_delete_files_element (file, callback) {
	fs.unlink (conf.dirs.root + "/static/" + file, function (err) {
		if (err) {
			return callback (code_response (500, sane_error(err)));
		} else {
			return callback (code_response (204));
		}
	});
}

// render a post page, but based on the data sent by a request instead of db
// data: the data sent
// callback: the function to call when response is ready
// returns nothing
// on success, serves html content (200)
// if the user data can't be rendered, serves plain text (400)
function admin_preview (data, callback) {
	var obj;
	try {
		obj = JSON.parse (data);
	} catch (err) {
		return callback (code_response (400, sane_error(err)));
	}
	if (! is_valid_post (obj)) {
		return callback (code_response (400, "Invalid data"));
	} else {
		return callback ({
			code: 200,
			message: {"Content-type": "text/html"},
			data: template ({
				type: "element",
				post: obj
			})
		});
	}
}

// secondary http listener function, for administrator private API
// req: node.js http request object
// res: node.js http response object
// returns nothing
// serves whatever the called functions serve
// if a function is not found, serves empty (404)
// if a method is not allowed, serves empty (405)
function admin_request_listener (req, res) {
	// a simple function to help with not repeating oneself
	function DRY (conf) { serve_response (conf, res); }
	// parse url and delimit the directories
	var purl = url.parse (req.url, true);
	var pathparts = purl.pathname.split ("/");

	// first we're going to match resources, and then their available verbs
	switch (pathparts[2]) {
	case "posts":
		if (pathparts[3]) {
			// /admin/posts/postid
			// available methods: GET, PUT, DELETE
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
			// available methods: GET, POST
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
			// /admin/files/filename
			// available methods: DELETE
			switch (req.method) {
			case "DELETE":
				admin_delete_files_element (pathparts[3], DRY);
				break;
			default:
				serve_response (code_response (405), res);
				break;
			}
		} else {
			// /admin/files
			// available methods: GET, POST
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
		// /admin/preview
		// available methods: POST
		if (req.method === "POST") {
			extract_request_data (req, function (data) {
				admin_preview (data, DRY);
			});
		} else {
			serve_response (code_response (405), res);
		}
		break;
	case "auth":
		// /admin/auth
		// available methods: GET
		if (req.method === "GET") {
			serve_response (code_response (200), res);
		} else {
			serve_response (code_response (405), res);
		}
		break;
	default:
		serve_response (code_response (404), res);
		break;
	}
}

// main function
// starts the http server
// no arguments
// returns nothing
function main () {
	var server = http.createServer();
	server.on ("request", request_listener);
	server.listen (conf.http.port, "127.0.0.1");
}

// let's get going!
main();
