#!/usr/bin/env node
// jshint esnext:true
// jshint asi:true
// jshint -W009
// jshint -W010
// jshint -W069
// jshint -W083

"use strict"

// libraries
const http = require("http")
const fs = require("fs")
const url = require("url")
const zlib = require("zlib")
const path = require("path")
const dot = require("dot")
const cheerio = require("cheerio")

// globals
let Render, Data, Conf
let router

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
}

// array[index] = val → object[val] = index
function array_to_object (arr) {
	let obj = new Object()
	for (let i = 0, len = arr.length; i < len; i++)
		obj[arr[i]] = i
	return obj
}

// return the mime type of a file
function determine_mime_type (path) {
	let index = path.slice(path.lastIndexOf("."))
	if (index in mime_types) return mime_types [index]
	else return "application/octet_stream"
}

// a blog entry
class Post {
	constructor (pathname) {
		this.extract_data(pathname)
	}

	extract_data (pathname) {
		this.pathname = pathname
		this.basename = path.basename(this.pathname)
		this.mtime = fs.statSync(this.pathname).mtime

		// blog posts are in html, parse them and extract data from them
		let $ = cheerio.load(fs.readFileSync(pathname, {"encoding":"utf-8"}))
		this.title = $("h1:first-of-type").html().trim()
		this.blurb = $("#blurb").html().trim()
		this.content = $("body").html().trim()
		// the meta element has a different API because it likes to feel special
		let meta = $("meta")
		for (let i = 0; i < meta.length; i++) {
			switch (meta[i].attribs.name) {
			case "date":
				this.date = new Date(meta[i].attribs.content)
				break
			case "keywords":
				this.categories = meta[i].attribs.content.split(", ")
				this.categories_hash = array_to_object(this.categories)
				break
			default:
				break
			}
		}
	}

	update () {
		this.extract_data(this.pathname)
	}

	has_category (category) {
		return (category in this.categories_hash)
	}
}

// a data structure holding all the blog posts & metadata
class DB {
	constructor (pathname) {
		this.pathname = pathname
		let posts = fs.readdirSync(this.pathname)
		this.posts = new Object()
		for (let i = 0, len = posts.length; i < len; i++)
			this.posts[posts[i]] = new Post(path.join(this.pathname, posts[i]))
		this.init_sorted()
	}

	// inits the array of sorted posts (reverse alphabetical order)
	init_sorted () {
		this.sorted = Object.keys(this.posts)
		this.sorted.sort()
		this.sorted.reverse()
		this.length = this.sorted.length
		for (let i = 0; i < this.length; i++)
			this.posts[this.sorted[i]].id = i
	}

	// reload the files
	update () {
		let posts = fs.readdirSync(path.join(this.pathname, "posts"))
		let hash = array_to_object(posts)
		this.purge_non_existent(hash)
		this.add_update_new(posts)
		this.init_sorted()
	}

	purge_non_existent (existent) {
		// remove files that no longer exist from the database
		for (let key in this.posts)
			if (this.posts.hasOwnProperty(key) && !(key in existent))
				delete this.posts[key]
	}

	add_update_new (posts) {
		// add files that don't exist in the database to the database
		// additionally, update files that were modified
		let pathname = ""
		for (let i = 0, len = posts.length; i < len; i++) {
			pathname = path.join(this.pathname, "posts", posts[i])
			if (!(this.exists(posts[i])))
				this.posts[posts[i]] = new Post(pathname)
			else if (fs.statSync(pathname).mtime > this.posts[posts[i]].mtime)
				this.posts[posts[i]].update()
		}
	}

	// run a query on the data
	// q: a URI query
	query (q, callback) {
		let results = new Array()
		let counter = Conf.blog.posts_per_page
		let i = 0
		let step = 1
		let cpost

		if (q.newer && q.older) {
			q.newer = null
			q.older = null
		} else if (q.newer) {
			q.newer = parseInt(q.newer, 10)
			if (Number.isInteger(q.newer)) {
				i = q.newer - 1
				step = -1
			} else q.newer = null
		} else if (q.older) {
			q.older = parseInt (q.older, 10)
			if (Number.isInteger(q.older)) i = q.older + 1
			else q.older = null
		}

		if (q.category)
			for (; i >= 0 && i < this.length && counter > 0; i += step) {
				cpost = this.posts[this.sorted[i]]
				if (cpost.has_category(q.category)) {
					results.push(cpost)
					counter -= 1
				}
			}
		else
			for (; i >= 0 && i < this.length && counter > 0; i += step) {
				cpost = this.posts[this.sorted[i]]
				results.push(cpost)
				counter -= 1
			}
		if (step === -1)
			results.reverse()
		callback(null, results)
	}

	// return whether post exists in database
	exists (post) {
		return (post in this.posts)
	}

	// get post from database
	get (post) {
		return (this.posts[post])
	}
}

class ResponseConf {
	constructor (code, message, data) {
		this.code = code
		this.message = message
		this.data = data
	}

	static code (num, msg) {
		return new ResponseConf(
			num,
			{"Content-type": "text/plain"},
			msg ? msg : "" + num
		)
	}

	static rss (results) {
		return new ResponseConf(
			200,
			{"Content-type": "application/rss+xml"},
			Render.rss({
				blog: Conf.blog,
				host: Conf.http.host,
				posts: results
			})
		)
	}

	static file (pathname) {
		return new ResponseConf(
			200,
			{"Content-type": determine_mime_type(pathname)},
			fs.createReadStream(pathname)
		)
	}

	static post (name) {
		return new ResponseConf(
			200,
			{"Content-type": "text/html"},
			Render.page({
				blog: Conf.blog,
				type: "element",
				post: Data.get(name)
			})
		)
	}

	static post_list (results, query) {
		return new ResponseConf(
			200,
			{"Content-type": "text/html"},
			Render.page({
				blog: Conf.blog,
				type: "collection",
				category: query.category || null,
				posts: results
			})
		)
	}

	static empty_page () {
		return new ResponseConf(
			404,
			{"Content-type": "text/html"},
			Render.page({
				blog: Conf.blog,
				type: "empty"
			})
		)
	}
}

class Router {
	constructor () {
		this.routes = []
	}

	indexOf (route) {
		for (var i = 0, len = this.routes.length; i < len; i++)
			if (this.routes[i].match === route) return i
		return -1
	}

	add_route (method, route, handler) {
		route = route.split("/").slice(1)
		if (route[0] === "") route = ["root"]
		let i = this.indexOf(route)
		if (i >= 0) this.routes[i][method] = handler
		else {
			let obj = {}
			obj["match"] = route
			obj[method] = handler
			this.routes.push(obj)
		}
	}

	match (method, str) {
		str = str.split("/").slice(1)
		if (str[0] === "") str = ["root"]
		for (let i = 0, len = this.routes.length; i < len; i++) {
			let match = this.match_route (str, method, this.routes[i])
			if (match === null) continue
			else return match
		}
		return null
	}

	match_route (str, method, route) {
		let match = route.match
		let params = []
		let i = 0
		let j = 0
		while (i < str.length) {
			switch(match[j]) {
			case str[i]:
				i++
				j++
				break
			case "*":
				params.push(str[i])
				i++
				j++		
				break
			case "**":
				if (match[j+1]) {
					let ind = str.indexOf(match[j+1], i)
					if (ind === -1) return null
					params.push(str.slice(i, ind).join("/"))
					i = ind
					j++
				} else {
					params.push(str.slice(i).join("/"))
					i = str.length
				}
				break
			default:
				return null
				break
			}
		}
		if (route.hasOwnProperty(method))
			return [route[method], params]
		else
			return null
	}
}

// serve a response
// conf: a response configuration object
function serve (res, conf) {
	// almost everything supports gzip compressed responses nowadays
	let gzip = zlib.createGzip()
	conf.message["content-encoding"] = "gzip"

	// we accept both streams and raw data
	res.writeHead(conf.code, conf.message, conf.headers)
	if (conf.data.constructor === fs.ReadStream) {
		conf.data.pipe(gzip).pipe(res)
	} else {
		gzip.end(conf.data)
		gzip.pipe(res)
	}
}

function request_listener (req, res) {
	function DRY (conf) { serve(res, conf) }
	req.url = url.parse(req.url, true)
	req.url.basename = path.basename(req.url.pathname)
	let match = router.match(req.method, req.url.pathname)
	if (match === null)
		DRY(ResponseConf.code(404))
	else
		match[0](req, ...match[1], DRY)
}

function get_posts_collection (req, callback) {
	let query = req.url.query
	Data.query(query, function (err, results) {
		if (err) {
			callback(ResponseConf.code (500, err.message))
		} else if (results.length > 0) {
			callback(ResponseConf.post_list(results, query))
		} else {
			// nothing found
			return callback(ResponseConf.empty_page())
		}
	})
}

function get_posts_element (req, name, callback) {
	if (Data.exists(name)) {
		callback(ResponseConf.post(name))
	} else {
		callback(ResponseConf.empty_page())
	}
}

function get_static_element (req, what, callback) {
	let pathname = path.join(Conf.fs.dir, "static", what)
	fs.exists(pathname, function (exists) {
		if (!exists) {
			return callback(ResponseConf.code(404, "Element doesn't exist"))
		} else {
			return callback(ResponseConf.file(pathname))
		}
	})
}

function get_rss_feed (req, callback) {
	Data.query({}, function (err, results) {
		if (results.length === 0) {
			callback(ResponseConf.code(404))
		} else {
			callback(ResponseConf.rss(results))
		}
	})
}

function read_env_conf () {
	Conf = {
		fs: {
			dir: process.env.PWD || "/tmp",
		},
		http: {
			port: process.env.PORT || 50000,
			host: process.env.HOST || "localhost",
		},
		blog: {
			title: process.env.TITLE || "User didn't configure blog title",
			description: process.env.DESCRIPTION || "USer didn't configure blog description",
			keywords: process.env.KEYWORDS ? process.env.KEYWORDS.split(", ") : ["user didn't configure blog keywords"],
			author: process.env.AUTHOR || "User didn't configure blog author",
			posts_per_page: process.env.PPP || 10,
		}
	}
}

function HUP_listener () {
	read_env_conf()
	init_templates()
	Data.update()
}

function init_templates () {
	Render = {
		page: dot.template(
			fs.readFileSync(
				path.join(Conf.fs.dir, "/template.html"),
				{"encoding": "utf-8"}
			)
		),
		rss: dot.template(
			fs.readFileSync(
				path.join(Conf.fs.dir, "/rss.xml"),
				{"encoding": "utf-8"}
			)
		)
	}
}

function init_server () {
	const server = http.createServer(request_listener)
	router = new Router()
	router.add_route("/", "GET", get_posts_collection)
	router.add_route("/posts", "GET", get_posts_collection)
	router.add_route("/posts/*", "GET", get_posts_element)
	router.add_route("/static/**", "GET", get_static_element)
	router.add_route("/feeds/rss.xml", "GET", get_rss_feed)
	server.listen(Conf.http.port, Conf.http.host)
}

function main () {
	process.on("SIGHUP", HUP_listener)
	read_env_conf()
	try {
		Data = new DB(path.join(Conf.fs.dir, "/posts"))
	} catch (e) {
		console.error("Couldn't initialise databse", e.name, e.message)
		throw new Error()
	}
	try {
		init_templates()
	} catch (e) {
		console.error("Couldn't initialise templates", e.name, e.message)
		throw new Error()
	}
	try {
		init_server()
	} catch (e) {
		console.error("Couldn't start server", e.name, e.message)
		throw new Error()
	}
	console.log(`Server listening to ${Conf.http.host}:${Conf.http.port}`)
}

try {
	main()
} catch (e) {
	process.exit(1)
}
