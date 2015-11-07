#!/usr/bin/env node
/* jshint -W009 */
/* jshint -W010 */
/* jshint -W069 */
/* jshint -W083 */

"use strict";

// libraries
var http = require("http"),
	fs = require("fs"),
	url = require("url"),
	zlib = require("zlib"),
	path = require("path"),
	dot = require("dot"),
	cheerio = require("cheerio");

// globals
var template, rss, data, conf;

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

// serve a response
// conf: a response configuration object
http.ServerResponse.prototype.serve = function serve (conf) {
	// almost everything supports gzip compressed responses nowadays
	var gzip = zlib.createGzip();
	conf.message["content-encoding"] = "gzip";

	// we accept both streams and raw data
	this.writeHead(conf.code, conf.message, conf.headers);
	if (conf.data.constructor === fs.ReadStream) {
		conf.data.pipe(gzip).pipe(this);
	} else {
		gzip.end(conf.data);
		gzip.pipe(this);
	}
};

// a blog entry
function Post (pathname) {
	this.extract_data(pathname);
}

Post.prototype.extract_data = function extract_data (pathname) {
	this.pathname = pathname;
	this.basename = path.basename(this.pathname);
	this.mtime = fs.statSync(this.pathname).mtime;

	// blog posts are in html, parse them and extract data from them
	var $ = cheerio.load(fs.readFileSync(pathname, {"encoding":"utf-8"}));
	this.title = $("h1:first-of-type").html().trim();
	this.blurb = $("#blurb").html().trim();
	this.content = $("body").html().trim();
	// the meta element has a different API because it likes to feel special
	var meta = $("meta");
	for (var i = 0; i < meta.length; i++) {
		switch (meta[i].attribs.name) {
		case "date":
			this.date = new Date(meta[i].attribs.content);
			break;
		case "keywords":
			this.categories = meta[i].attribs.content.split(", ");
			this.categories_hash = array_val_flags(this.categories);
			break;
		default:
			break;
		}
	}
};

Post.prototype.update = function update () {
	this.extract_data(this.pathname);
};

// a data structure holding all the blog posts & metadata
function DB (pathname) {
	this.pathname = pathname;
	var posts = fs.readdirSync(this.pathname);
	this.posts = new Object();
	for (var i = 0, len = posts.length; i < len; i++) {
		this.posts[posts[i]] = new Post(path.join(this.pathname, posts[i]));
	}
	this.init_sorted();
}

// inits the array of sorted posts (reverse alphabetical order)
DB.prototype.init_sorted = function init_sorted () {
	this.sorted = Object.keys(this.posts);
	this.sorted.sort();
	this.sorted.reverse();
	this.length = this.sorted.length;
	for (var i = 0; i < this.length; i++) {
		this.posts[this.sorted[i]].id = i;
	}
};

// reload the files
DB.prototype.update = function update () {
	var posts = fs.readdirSync(path.join(this.pathname, "posts"));
	var hash = new Object();
	for (var i = 0, len = posts.length; i < len; i++) {
		hash[posts[i]] = i;
	}
	// remove files that no longer exist from the database
	for (var key in this.posts) {
		if (this.posts.hasOwnProperty(key) && !(key in hash)) {
			delete this.posts[key];
		}
	}
	// add files that don't exist in the database to the database
	// additionally, update files that were modified
	var pathname = "";
	for (i = 0, len = posts.length; i < len; i++) {
		pathname = path.join(this.pathname, "posts", posts[i]);
		if (!(this.exists(posts[i]))) {
			this.posts[posts[i]] = new Post(pathname);
		} else if (fs.statSync(pathname).mtime > this.posts[posts[i]].mtime) {
			this.posts[posts[i]].update();
		}
	}
	this.init_sorted();
};

// run a query on the data
// query: a URI query
// callback (results): function to call when results are acquired
DB.prototype.query = function query (q, callback) {
	if (!(q) || typeof q !== "object") {
		q = new Object();
	}
	var results = new Array();
	var counter = conf.blog.posts_per_page;
	var i = 0;
	var step = 1;

	if (q.newer && q.older) {
		q.newer = null;
		q.older = null;
	} else if (q.newer) {
		q.newer = parseInt(q.newer, 10);
		if (Number.isInteger(q.newer)) {
			i = q.newer - 1;
			step = -1;
		} else {
			q.newer = null;
		}
	} else if (q.older) {
		q.older = parseInt (q.older, 10);
		if (Number.isInteger(q.older)) {
			i = q.older + 1;
		} else {
			q.older = null;
		}
	}

	if (q.category) {
		for (; i >= 0 && i < this.length && counter > 0; i += step) {
			if (this.posts[this.sorted[i]][q.category] === true) {
				results.push(this.posts[this.sorted[i]]);
				counter -= 1;
			}
		}
	} else {
		for (; i >= 0 && i < this.length && counter > 0; i += step) {
			results.push(this.posts[this.sorted[i]]);
			counter -= 1;
		}
	}
	if (step === -1) {
		results.reverse();
	}
	callback(null, results);
};

// return whether post exists in database
DB.prototype.exists = function exists(post) {
	return (post in this.posts);
};

// get post from database
DB.prototype.get = function get (post) {
	return (this.posts[post]);
};

// array[index] = val → object[val] = true
function array_val_flags (arr) {
	var obj = new Object();
	for (var i = 0, len = arr.length; i < len; i++) {
		obj[arr[i]] = true;
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

// return the mime type of a file
// path: path to the file
// returns string
function determine_mime_type (path) {
	var index = path.slice(path.lastIndexOf("."));
	if (index in mime_types) {
		return mime_types [index];
	} else {
		return "application/octet_stream";
	}
}

// render the page for GET /posts
// query: the user query object
// callback (res_conf): the function to call when the response is ready
// returns nothing
// on success, serves HTML content (200)
// if nothing is found, serves empty (404)
function get_posts_collection (query, callback) {
	data.query(query, function (err, results) {
		if (err) {
			return callback(code_response (500, err.message));
		} else if (results.length > 0) {
			return callback({
				code: 200,
				message: {"Content-type": "text/html"},
				data: template({ // render the page
					blog: conf.blog,
					type: "collection",
					category: (query && query.category) ? query.category : null,
					posts: results
				})
			});
		} else {
			return callback({
				code: 404,
				message: {"Content-type": "text/html"},
				data: template({
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
	if (data.exists(name)) {
		return callback({
			code: 200,
			message: {"Content-type": "text/html"},
			data: template({ // render the page
				blog: conf.blog,
				type: "element",
				post: data.get(name)
			})
		});
	} else {
		return callback({
			code: 404,
			message: {"Content-type": "text/html"},
			data: template({
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
	data.query(null, function (err, results) {
		if (results.length === 0) {
			// nothing found
			return callback(code_response(404));
		}
		return callback({
			code: 200,
			message: {"Content-type": "application/rss+xml"},
			data: rss({
				blog: conf.blog,
				host: conf.http.host,
				posts: results
			})
		});
	});
}

// serve a static file
function get_static_element (what, callback) {
	var pathname = path.join(conf.fs.dir, what);
	fs.exists(pathname, function (exists) {
		if (!exists) {
			return callback(code_response(404, "Element doesn't exist"));
		}
		return callback({
			code: 200,
			message: { "Content-type": determine_mime_type(pathname) },
			data: fs.createReadStream(pathname)
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
	// parse the url and delimit the directories
	var purl = url.parse(req.url, true);
	var pathparts = purl.pathname.split("/");

	switch (pathparts[1]) {
	case "":
		// same as GET /posts
		if (req.method !== "GET") {
			res.serve(code_response(405, "Only GET methods allowed"));
		} else {
			get_posts_collection(null, res.serve.bind(res));
		}
		break;
	case "static":
		// serve static files
		if (req.method !== "GET") {
			res.serve(code_response(405, "Only GET methods allowed"));
		} else if (!pathparts[2]) {
			res.serve(code_response(404, "Element doesn't exist"));
		} else {
			get_static_element(purl.pathname, res.serve.bind(res));
		}
		break;
	case "posts":
		// public api for reading posts
		if (req.method !== "GET") {
			// guests can do nothing but read posts
			res.serve(code_response(405, "Only GET methods allowed"));
		} else if (pathparts[2]) {
			// GET /posts/postid
			// render a single post
			get_posts_element(pathparts[2], res.serve.bind(res));
		} else {
			// GET /posts
			// render a list / summary of several posts
			get_posts_collection(purl.query, res.serve.bind(res));
		}
		break;
	case "feeds":
		if (req.method !== "GET") {
			res.serve(code_response(405, "Only GET methods are allowed"));
		} else if (pathparts [2] === "rss.xml") {
			get_rss_feed(res.serve.bind(res));
		} else {
			res.serve(code_response(404, "Not found"));
		}
		break;
	default:
		res.serve(code_response(404, "Not found"));
		break;
	}
}

function read_env_conf () {
	conf = {
		fs: {
			dir: process.env.PWD,
		},
		http: {
			port: process.env.PORT || 50000,
			host: process.env.HOST || "localhost",
		},
		blog: {
			title: process.env.TITLE,
			description: process.env.DESCRIPTION,
			keywords: process.env.KEYWORDS.split(", "),
			author: process.env.AUTHOR,
			posts_per_page: process.env.PPP || 10,
		}
	};
}

// listens to SIGHUP
// reconfigures the server
function HUP_listener () {
	read_env_conf();
	init_templates();
	data.update();
}

// compile the templates
function init_templates () {
	template = dot.template(
		fs.readFileSync(
			path.join(conf.fs.dir, "/template.html"),
			{"encoding": "utf-8"}
		)
	);

	rss = dot.template(
		fs.readFileSync(
			path.join(conf.fs.dir, "/rss.xml"),
			{"encoding": "utf-8"}
		)
	);
}

// listen to signals
function init_process () {
	process.on("SIGHUP", HUP_listener);
}

// start the http server
function init_server () {
	http.createServer(request_listener).listen(conf.http.port, conf.http.host);
}

// gets things going
function main () {
	init_process();
	console.log("Configuring.");
	read_env_conf();
	console.log("Parsing posts.");
	data = new DB(path.join(conf.fs.dir, "/posts"));
	console.log("Compiling templates.");
	init_templates();
	console.log("Starting server.");
	init_server();
	console.log("Server listening to " + conf.http.host + ":" + conf.http.port);
}

main();
