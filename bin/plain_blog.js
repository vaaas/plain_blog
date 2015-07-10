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
var cheerio = require("cheerio");
var conf = require("/etc/plain_blog.js");
var template, rss, data;

function isInt (n) {
	return n % 1 === 0;
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
	res.end (conf.data);
}

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
			clause = clause && data[data.posts[i]].categories.indexOf (query.category) == -1 ? false : true;
		}
		if (clause) {
			results.push (data[data.posts[i]]);
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

// render the page for GET /posts/postid
// id: the post id
// callback (res_conf): the function to call when the response is ready
// returns nothing
// on success, serves HTML content (200)
// if query is invalid, serves plain text (400)
// if something goes wrong with the query, serves plain text (500)
function get_posts_element (name, callback) {
	if (data[name]) {
		return callback ({
			code: 200,
			message: {"Content-type": "text/html"},
			data: template ({ // render the page
				blog: conf.blog,
				type: "element",
				post: data[name]
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

function get_rss_feed (callback) {
	var results = new Array();
	for (var i = 0; i < data.length && i < conf.blog.posts_per_page; i++) {
		results.push (data[data.posts[i]]);
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

function init_data () {
	var posts = fs.readdirSync ("./posts");
	posts.sort();
	posts.reverse();
	data = new Object ();
	data.posts = posts;
	data.length = posts.length;
	for (var i = 0, len = posts.length; i < len; i++) {
		data[posts[i]] = new Object();
		var $ = cheerio.load (
			fs.readFileSync (
				"./posts/" + posts[i],
				{ "encoding" : "utf-8" }
			)
		);
		data[posts[i]].name = posts[i];
		data[posts[i]].id = i;
		data[posts[i]].title = $("h1:first-of-type").html().trim();
		data[posts[i]].blurb = $("#blurb").html().trim();
		data[posts[i]].content = $("body").html().trim();

		var meta = $("meta");
		var keys = Object.keys (meta);
		for (var j = 0, len2 = keys.length; j < len2; j++) {
			if (!meta[keys[j]].attribs) {
				continue;
			}
			switch (meta[keys[j]].attribs.name) {
			case "date":
				data[posts[i]].date = new Date (meta[keys[j]].attribs.content);
				break;
			case "keywords":
				data[posts[i]].categories = meta[keys[j]].attribs.content.split(", ");
				break;
			default:
				continue;
				break;
			}
		}
	}
}

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

function init_server () {
	var server = http.createServer();
	server.on ("request", request_listener);
	server.listen (conf.http.port, "127.0.0.1");
}

// main function
// no arguments
// returns nothing
function main () {
	init_data();
	init_templates();
	init_server();
}

// let's get going!
main();
