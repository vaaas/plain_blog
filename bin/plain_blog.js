#!/usr/bin/env node
/* jshint -W009 */
/* jshint -W010 */
/* jshint -W069 */
/* jshint -W083 */

"use strict";

// libraries
const http = require("http");
const fs = require("fs");
const url = require("url");
const zlib = require("zlib");
const path = require("path");
const dot = require("dot");
const cheerio = require("cheerio");

// globals
var Render, data, conf;

const mime_types = {
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

// array[index] = val → object[val] = index
function array_to_object (arr) {
	var obj = new Object();
	for (var i = 0, len = arr.length; i < len; i++) {
		obj[arr[i]] = i;
	}
	return obj;
}

// return the mime type of a file
function determine_mime_type (path) {
	var index = path.slice(path.lastIndexOf("."));
	if (index in mime_types) {
		return mime_types [index];
	} else {
		return "application/octet_stream";
	}
}

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
class Post {
	constructor (pathname) {
		this.extract_data(pathname);
	}

	extract_data (pathname) {
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
				this.categories_hash = array_to_object(this.categories);
				break;
			default:
				break;
			}
		}
	}

	update () {
		this.extract_data(this.pathname);
	}

	has_category (category) {
		return (category in this.categories_hash);
	}
}

// a data structure holding all the blog posts & metadata
class DB {
	constructor (pathname) {
		this.pathname = pathname;
		var posts = fs.readdirSync(this.pathname);
		this.posts = new Object();
		for (var i = 0, len = posts.length; i < len; i++) {
			this.posts[posts[i]] = new Post(path.join(this.pathname, posts[i]));
		}
		this.init_sorted();
	}

	// inits the array of sorted posts (reverse alphabetical order)
	init_sorted () {
		this.sorted = Object.keys(this.posts);
		this.sorted.sort();
		this.sorted.reverse();
		this.length = this.sorted.length;
		for (var i = 0; i < this.length; i++) {
			this.posts[this.sorted[i]].id = i;
		}
	}

	// reload the files
	update () {
		var posts = fs.readdirSync(path.join(this.pathname, "posts"));
		var hash = array_to_object(posts);
		this.purge_non_existent(hash);
		this.add_update_new(posts);
		this.init_sorted();
	}

	purge_non_existent (existent) {
		// remove files that no longer exist from the database
		for (var key in this.posts) {
			if (this.posts.hasOwnProperty(key) && !(key in existent)) {
				delete this.posts[key];
			}
		}
	}

	add_update_new (posts) {
		// add files that don't exist in the database to the database
		// additionally, update files that were modified
		var pathname = "";
		for (var i = 0, len = posts.length; i < len; i++) {
			pathname = path.join(this.pathname, "posts", posts[i]);
			if (!(this.exists(posts[i]))) {
				this.posts[posts[i]] = new Post(pathname);
			} else if (fs.statSync(pathname).mtime > this.posts[posts[i]].mtime) {
				this.posts[posts[i]].update();
			}
		}
	}

	// run a query on the data
	// q: a URI query
	query (q, callback) {
		var results = new Array();
		var counter = conf.blog.posts_per_page;
		var i = 0;
		var step = 1;
		var cpost;

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
				cpost = this.posts[this.sorted[i]];
				if (cpost.has_category(q.category)) {
					results.push(cpost);
					counter -= 1;
				}
			}
		} else {
			for (; i >= 0 && i < this.length && counter > 0; i += step) {
				cpost = this.posts[this.sorted[i]];
				results.push(cpost);
				counter -= 1;
			}
		}
		if (step === -1) {
			results.reverse();
		}
		callback(null, results);
	}

	// return whether post exists in database
	exists(post) {
		return (post in this.posts);
	}

	// get post from database
	get (post) {
		return (this.posts[post]);
	}
}

class ResponseConf {
	static code (num, msg) {
		return {
			code: num,
			message: {"Content-type": "text/plain"},
			data: msg ? msg : "" + num
		};
	}

	static rss (results) {
		return {
			code: 200,
			message: {"Content-type": "application/rss+xml"},
			data: Render.rss({
				blog: conf.blog,
				host: conf.http.host,
				posts: results
			})
		};
	}

	static file (pathname) {
		return {
			code: 200,
			message: {
				"Content-type": determine_mime_type(pathname)
			},
			data: fs.createReadStream(pathname)
		};
	}

	static post (name) {
		return {
			code: 200,
			message: {"Content-type": "text/html"},
			data: Render.page({
				blog: conf.blog,
				type: "element",
				post: data.get(name)
			})
		};
	}

	static post_list (results, query) {
		return {
			code: 200,
			message: {"Content-type": "text/html"},
			data: Render.page({
				blog: conf.blog,
				type: "collection",
				category: query.category || null,
				posts: results
			})
		};
	}

	static empty_page () {
		return {
			code: 404,
			message: {"Content-type": "text/html"},
			data: Render.page({
				blog: conf.blog,
				type: "empty"
			})
		};
	}
}

class WebServer {
	constructor (port, host) {
		this.server = http.createServer(this.request_listener.bind(this));
		this.server.listen(port, host);
	}

	request_listener (req, res) {
		req.url = url.parse(req.url, true);
		req.url.basename = path.basename(req.url.pathname);
		req.url.split = req.url.pathname.split("/");
		req.url.split.shift();
		switch (req.method) {
			case "GET":
				this.get (req, res);
				break;
			default:
				res.serve(ResponseConf.code(405, "Only GET methods are allowed"));
				break;
		}
	}

	get (req, res) {
		switch (req.url.split.shift()) {
			case "":
				this.get_posts_collection({}, res.serve.bind(res));
				break;
			case "posts":
				if (req.url.split.shift()) {
					this.get_posts_element(req.url.basename, res.serve.bind(res));
				} else {
					this.get_posts_collection(req.url.query, res.serve.bind(res));
				}
				break;
			case "static":
				if (req.url.split.shift()) {
					this.get_static_element(req.url.basename, res.serve.bind(res));
				} else {
					res.serve(ResponseConf.code(400));
				}
				break;
			case "feeds":
				if (req.url.split.shift() == "rss.xml") {
					this.get_rss_feed(res.serve.bind(res));
				} else {
					res.serve(ResponseConf.code(404, "Not found"));
				}
				break;
			default:
				res.serve(ResponseConf.code(404, "Not found"));
				break;
		}
	}

	get_static_element (what, callback) {
		var pathname = path.join(conf.fs.dir, "static", what);
		fs.exists(pathname, function (exists) {
			if (!exists) {
				return callback(ResponseConf.code(404, "Element doesn't exist"));
			} else {
				return callback(ResponseConf.file(pathname));
			}
		});
	}

	get_rss_feed (callback) {
		data.query({}, function (err, results) {
			if (results.length === 0) {
				callback(ResponseConf.code(404));
			} else {
				callback(ResponseConf.rss(results));
			}
		});
	}

	get_posts_element (name, callback) {
		if (data.exists(name)) {
			callback(ResponseConf.post(name));
		} else {
			callback(ResponseConf.empty_page());
		}
	}

	get_posts_collection (query, callback) {
		data.query(query, function (err, results) {
			if (err) {
				callback(ResponseConf.code (500, err.message));
			} else if (results.length > 0) {
				callback(ResponseConf.post_list(results, query));
			} else {
				// nothing found
				return callback(ResponseConf.empty_page());
			}
		});
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

function HUP_listener () {
	read_env_conf();
	init_templates();
	data.update();
}

function init_templates () {
	Render = {
		page: dot.template(
			fs.readFileSync(
				path.join(conf.fs.dir, "/template.html"),
				{"encoding": "utf-8"}
			)
		),
		rss: dot.template(
			fs.readFileSync(
				path.join(conf.fs.dir, "/rss.xml"),
				{"encoding": "utf-8"}
			)
		)
	}
}

function init_process () {
	process.on("SIGHUP", HUP_listener);
}

function init_server () {
	new WebServer(conf.http.port, conf.http.host);
}

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
