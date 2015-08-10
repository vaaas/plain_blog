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
var zlib = require("zlib");
var cheerio = require("cheerio");
var conf = require("/etc/plain_blog.js");
var template, rss, data; // global variables

var mime_types = {
	".html": "text/html",
	".htm": "text/html",
	".css": "text/css",
	".xml": "text/xml",
	".txt": "text/plain",

	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".ico": "image/x-icon",
	".bmp": "image/x-ms-bmp",
	".svg": "image/svg+xml",
	".svgz": "image/svg+xml",
	".webp": "image/webp",

	".js": "application/javascript",
	".atom": "application/atom+xml",
	".rss": "application/rss+xml",
	".json": "application/json",
	".woff": "application/font-woff",
	".jar": "application/java-archive",
	".war": "applicaiton/java-archive",
	".ear": "applicaiton/java-archive",
	".doc": "application/msword",
	".pdf": "application/pdf",
	".rtf": "application/rtf",
	".xls": "application/vnd.ms-excel",
	".ppt": "application/vnd.ms-powerpoint",
	".xhtml": "application/xhtml+xml",
	".7z": "application/x-7z-compressed",
	".zip": "application/zip",
	".rar": "application/x-rar-compressed",

	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".oga": "audio/ogg",
	".m4a": "audio/x-m4a",
	".aac": "audio/x-m4a",

	".webm": "video/webm",
	".mp4": "video/mp4",
	".mkv": "video/x-matroska",
	".flv": "video/x-flv",
	".avi": "video/x-msvideo",
	".mpg": "video/mpeg",
	".mpeg": "video/mpeg",
	".wmv": "video/x-ms-wmv",
	".mov": "video/quicktime",
	".3gp": "video/3gpp",
	".3gpp": "video/3gpp",
};

// check whether a number is an integer
// n: the number
// returns bool
function isInt (n) {
	return n % 1 === 0;
}

// transforms an array into an object
// the array's index becomes the object's value, and the array's value becomes
// the object's key
// arr: the array
// returns object
function array_to_object (arr) {
	var obj = new Object();
	for (var i = 0, len = arr.length; i < len; i++) {
		obj[arr[i].name] = i;
	}
	return obj;
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

// serve a response
// conf: a response configuration object
// res: node.js http response object
// returns nothing
function serve_response (conf, res) {
	res.writeHead (conf.code, conf.message, conf.headers);

	if (conf.data.constructor === fs.ReadStream) {
		conf.data.on ("data", function (chunk) {
			res.write (chunk);
		});
		conf.data.on ("end", function () {
			res.end();
		});
	} else {
		res.end (conf.data);
	}
}

// return the mime type of a file
// path: path to the file
// returns string
function determine_mime_type (path) {
	var index = path.slice (path.lastIndexOf ("."));
	if (index in mime_types) {
		return mime_types [index];
	} else {
		return "application/octet_stream";
	}
}

// run a query on the data
// query: a URI query
// callback (results): function to call when results are acquired
// returns nothing
function execute_query (query, callback) {
	var results = new Array();
	var counter = conf.blog.posts_per_page;
	var i = 0;
	var rev = false;
	var clause = true;

	if (query.newer && query.older) {
		query.newer = null;
		query.older = null;
	} else if (query.newer) {
		query.newer = parseInt (query.newer, 10);
		if (isInt(query.newer)) {
			i = query.newer - 1;
			rev = true;
		} else {
			query.newer = null;
		}
	} else if (query.older) {
		query.older = parseInt (query.older, 10);
		if (isInt(query.older)) {
			i = query.older + 1;
		} else {
			query.older = null;
		}
	}

	while (counter > 0 && i >= 0 && i < data.length) {
		if (query.category) {
			clause = clause && data.posts[i].categories.indexOf (query.category)=== -1 ? false : true;
		}
		if (clause) {
			results.push (data.posts[i]);
			counter -= 1;
		}
		if (rev) {
			i -= 1;
		} else {
			i += 1;
		}
	}
	if (rev) {
		results.reverse();
	}
	callback (results);
}

// render the page for GET /posts
// query: the user query object
// callback (res_conf): the function to call when the response is ready
// returns nothing
// on success, serves HTML content (200)
// if nothing is found, serves empty (404)
function get_posts_collection (query, callback) {
	if (!query || query.constructor !== Object) {
		query = new Object();
	}
	execute_query (query, function (results) {
		if (results.length > 0) {
			return callback ({
				code: 200,
				message: {"Content-type": "text/html"},
				data: template ({ // render the page
					blog: conf.blog,
					type: "collection",
					category: (query && query.category) ? query.category : null,
					posts: results
				})
			});
		} else {
			return callback ({
				code: 404,
				message: {"Content-type": "text/html"},
				data: template ({
					blog: conf.blog,
					type: "empty"
				})
			});
		}
	});
}

// render the page for GET /posts/post
// name: the post file name
// callback (res_conf): the function to call when the response is ready
// returns nothing
// on success, serves HTML content (200)
// if nothing is found, serves HTML content (404)
function get_posts_element (name, callback) {
	if (data.keys[name] !== undefined) {
		return callback ({
			code: 200,
			message: {"Content-type": "text/html"},
			data: template ({ // render the page
				blog: conf.blog,
				type: "element",
				post: data.posts[data.keys[name]]
			})
		});
	} else {
		return callback ({
			code: 404,
			message: {"Content-type": "text/html"},
			data: template ({
				blog: conf.blog,
				type: "empty"
			})
		});
	}
}

// render the page for GET /feeds/rss.xml
// callback (res_conf): the function to call when the resposne is ready
// returns nothing
// on success, serves RSS+XML content (200)
// if nothing is found, serves plain text (404)
function get_rss_feed (callback) {
	var results = new Array();
	for (var i = 0; i < data.length && i < conf.blog.posts_per_page; i++) {
		results.push (data.posts[i]);
	}
	if (results.length === 0) {
		// nothing found
		return callback (code_response (404));
	} else {
		return callback ({
			code: 200,
			message: {"Content-type": "application/rss+xml"},
			data: rss ({
				blog: conf.blog,
				posts: results
			})
		});
	}
}

// serve a static file
function get_static_element (path, callback) {
	if (path [0] === "/") {
		path = "." + path;
	}
	fs.exists (path, function (exists) {
		if (!exists) {
			return callback (code_response (404, "Element doesn't exist"));
		}
		return callback({
			code: 200,
			message: { "Content-type": determine_mime_type (path) },
			data: fs.createReadStream (path)
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
	case "":
		// same as GET /posts

		if (req.method !== "GET") {
			serve_response (code_response (405, "Only GET methods allowed"), res);
		} else {
			get_posts_collection (null, DRY);
		}
	case "static":
		// serve static files
		if (req.method !== "GET") {
			serve_response (code_response (405, "Only GET methods allowed"), res);
		} else if (!pathparts[2]) {
			serve_response (code_response (404, "Element doesn't exist"), res);
		} else {
			get_static_element (purl.pathname, DRY);
		}
		break;
	case "posts":
		// public api for reading posts
		if (req.method !== "GET") {
			// guests can do nothing but read posts
			serve_response (code_response (405, "Only GET methods allowed"), res);
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
	case "feeds":
		if (req.method !== "GET") {
			serve_response (code_response (405, "Only GET methods are allowed"));
		} else if (pathparts [2] === "rss.xml") {
			get_rss_feed (DRY);
		} else {
			serve_response (code_response (404), res);
		}
		break;
	default:
		serve_response (code_response (404), res);
		break;
	}
}

// listens to SIGHUP
// reconfigures the server
// no arguments
// returns nothing
function HUP_listener () {
	conf = require("/etc/plain_blog.js");
	init_templates();
	update_data();
}

// extract information from a HTML file
// file: the file path as string
// returns object
function extract_data (file) {
	var $ = cheerio.load (
		fs.readFileSync (
			"./posts/" + file,
			{ "encoding" : "utf-8" }
		)
	);
	var data = new Object();
	data.name = file;
	data.mtime = fs.statSync("./posts/" + file).mtime;
	data.title = $("h1:first-of-type").html().trim();
	data.blurb = $("#blurb").html().trim();
	data.content = $("body").html().trim();

	var meta = $("meta");
	var keys = Object.keys (meta);
	for (var i = 0, len = keys.length; i < len; i++) {
		if (!meta[keys[i]].attribs) {
			continue;
		}
		switch (meta[keys[i]].attribs.name) {
		case "date":
			data.date = new Date (meta[keys[i]].attribs.content);
			break;
		case "keywords":
			data.categories = meta[keys[i]].attribs.content.split(", ");
			break;
		default:
			break;
		}
	}
	return data;
}

// initialise data.posts
// posts: an array of pathnames as strings
// returns an array of objects
function init_posts_array (posts) {
	var arr = new Array();
	for (var i = 0, len = posts.length; i < len; i++) {
		arr.push (extract_data (posts[i]));
		arr[i].id = i;
	}
	return arr;
}

// initialise the database
// no arguments
// returns nothing
function init_data () {
	var posts = fs.readdirSync ("./posts");
	posts.sort();
	posts.reverse();
	data = new Object ();
	data.posts = init_posts_array (posts);
	data.keys = array_to_object (data.posts);
	data.length = data.posts.length;
}

// update the database
// no arguments
// returns nothing
function update_data () {
	var posts = fs.readdirSync ("./posts");
	var hash = array_to_object (posts);
	posts.sort();
	posts.reverse();
	// remove files that no longer exist from the database
	for (var i = 0, len = data.length; i < len; i++) {
		if (hash[data.posts[i].name] === undefined) {
			data.posts.splice (i, 1);
		}
	}
	// add files that don't exist in the database to the database
	// additionally, update files that were modified
	for (i = 0, len = posts.length; i < len; i++) {
		if (data.keys[posts[i]] === undefined) {
			data.posts.push (extract_data (posts[i]));
		} else if (fs.statSync(posts[i]).mtime > data.posts[data.keys[posts[i]]].mtime) {
			data.posts[data.keys[posts[i]]] = extract_data(posts[i]);
		}
	}
	data.posts.sort (function (a, b) {
		if (a.name < b.name)
			return -1;
		else if (a.name > b.name)
			return 1;
		else
			return 0;
	});
	data.posts.reverse();
	data.length = data.posts.length;
	for (i = 0; i < data.length; i++)
		data.posts[i].id = i;
	data.keys = array_to_object (data.posts);
}

// compile the templates
// no arguments
// returns nothing
function init_templates () {
	template = dot.template (
		fs.readFileSync (
			"./template.html",
			{"encoding": "utf-8"}
		)
	);

	rss = dot.template (
		fs.readFileSync (
			"./rss.xml",
			{"encoding": "utf-8"}
		)
	);
}

// listen to signals
// no arguments
// returns nothing
function init_process () {
	process.on ("SIGHUP", HUP_listener);
}

function init () {
	console.log ("Parsing files.");
	init_data();
	console.log ("Compiling templates.");
	init_templates();
	init_process();
}


function main () {
	init();
	process.on ("SIGHUP", HUP_listener);
	http.createServer(request_listener).listen (80, conf.blog.host);
}

if (require.main === module) {
	main();
} else {
	module.exports = {
		init: init,
		HUP_listener: HUP_listener,
		request_listener: request_listener
	}
}
