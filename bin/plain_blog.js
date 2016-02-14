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
const path = require("path")
const dot = require("dot")
const cheerio = require("cheerio")
const sqlite = require("sqlite3")

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

// returns whether two arrays have the exact same children
function array_identity (arr1, arr2) {
	let len = arr1.length
	if (len !== arr2.length) return false
	for (let i = 0; i < len; i++)
		if (arr1[i] !== arr2[i]) return false
	return true
}

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

class ResponseConf {
	constructor (code, message, data) {
		this.code = code
		this.message = message
		this.data = data
	}
}

class Router extends Array {
	indexOf (route) {
		for (var i = 0, len = this.length; i < len; i++)
			if (array_identity(route, this[i].match))
				return i
		return -1
	}

	add_route (method, route, handler) {
		route = route.split("/").slice(1)
		let i = this.indexOf(route)
		if (i >= 0) this[i][method] = handler
		else {
			let obj = {}
			obj["match"] = route
			obj[method] = handler
			this.push(obj)
		}
	}

	match (req) {
		let method = req.method
		let str = req.url.pathname.split("/").slice(1)
		for (let i = 0, len = this.length; i < len; i++) {
			let route = this[i]
			let params = this.match_route (str, route)
			if (params === null) continue
			else return [route[method], params]
		}
		return null
	}

	match_route (str, route) {
		const match = route.match
		if (str.length < match.length) return null
		const params = []
		let i = 0
		let j = 0
		while (i < str.length) {
			if (match[j] === str[i]) {
				i += 1
				j += 1
			} else if (match[j] === "*" && str[i].length > 0) {
				params.push(str[i])
				i += 1
				j += 1
			} else if (match[j] === "**" && str[i].length > 0) {
				if (match[j+1]) {
					let ind = str.indexOf(match[j+1], i)
					if (ind === -1) return null
					params.push(str.slice(i, ind).join("/"))
					i = ind
					j += 1
				} else {
					params.push(str.slice(i).join("/"))
					i = str.length
					j += 1
				}
			} else {
				return null
			}
		}
		return params
	}
}

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

class Model {
	constructor (pathname, posts_per_page) {
		this.posts_per_page = posts_per_page
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
		let i = 0
		let step = 1
		let counter = this.posts_per_page
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

class View {
	constructor (templates, host, blog) {
		this.templates = templates
		this.host = host
		this.blog = blog
	}

	code (num, msg) {
		return new ResponseConf(
			num,
			{"Content-type": "text/plain"},
			msg ? msg : "" + num
		)
	}

	rss (results) {
		return new ResponseConf(
			200,
			{"Content-type": "application/rss+xml"},
			this.templates.rss({
				blog: this.blog,
				host: this.host,
				posts: results
			})
		)
	}

	file (pathname) {
		return new ResponseConf(
			200,
			{"Content-type": determine_mime_type(pathname)},
			fs.createReadStream(pathname)
		)
	}

	post (post) {
		return new ResponseConf(
			200,
			{"Content-type": "text/html"},
			this.templates.index({
				blog: this.blog,
				type: "element",
				post: post
			})
		)
	}

	post_list (results, query) {
		return new ResponseConf(
			200,
			{"Content-type": "text/html"},
			this.templates.index({
				blog: this.blog,
				type: "collection",
				category: query.category || null,
				posts: results
			})
		)
	}

	empty_page () {
		return new ResponseConf(
			404,
			{"Content-type": "text/html"},
			this.templates.index({
				blog: this.blog,
				type: "empty"
			})
		)
	}
}

class Controller {
	constructor (model, view, port, hostname) {
		this.model = model
		this.view = view
		this.router = this.init_router()
		this.server = http.createServer(this.request_listener.bind(this))
		this.server.listen(port, hostname)
	}

	init_router () {
		const router = new Router()
		router.add_route("GET", "/", this.get_posts_collection.bind(this))
		router.add_route("GET", "/posts", this.get_posts_collection.bind(this))
		router.add_route("GET", "/posts/*", this.get_posts_element.bind(this))
		router.add_route("GET", "/static/**", this.get_static_element.bind(this))
		router.add_route("GET", "/feeds/rss.xml", this.get_rss_feed.bind(this))
		return router
	}

	// serve a response
	// conf: a response configuration object
	serve (res, conf) {
		// we accept both streams and raw data
		res.writeHead(conf.code, conf.message, conf.headers)
		if (conf.data.constructor === fs.ReadStream) {
			conf.data.pipe(res)
		} else {
			res.end(conf.data)
		}
	}

	request_listener (req, res) {
		req.url = url.parse(req.url, true)
		req.url.basename = path.basename(req.url.pathname)
		let match = this.router.match(req)
		if (match === null)
			this.serve(res, this.view.code(404))
		else if (match[0] === undefined)
			this.serve(res, this.view.code(405))
		else
			match[0](req, res, ...match[1])
	}

	get_posts_collection (req, res) {
		let query = req.url.query
		this.model.query(query, (err, results) => {
			if (err) {
				this.serve(res, this.view.code (500, err.message))
			} else if (results.length > 0) {
				this.serve(res, this.view.post_list(results, query))
			} else {
				this.serve(res, this.view.empty_page())
			}
		})
	}

	get_posts_element (req, res, name) {
		if (this.model.exists(name)) {
			this.serve(res, this.view.post(this.model.get(name)))
		} else {
			this.serve(res, this.view.empty_page())
		}
	}

	get_static_element (req, res, what) {
		let pathname = path.join("./static", what)
		fs.exists(pathname, (exists) => {
			if (!exists) {
				this.serve(res, this.view.code(404, "Element doesn't exist"))
			} else {
				this.serve(res, this.view.file(pathname))
			}
		})
	}

	get_rss_feed (req, res) {
		this.model.query({}, (err, results) => {
			if (results.length === 0) {
				this.serve(res, this.view.code(404))
			} else {
				this.serve(res, this.view.rss(results))
			}
		})
	}
}

function Conf () {
	return {
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

function main () {
	const conf = new Conf()
	const model = new Model("./posts", conf.blog.posts_per_page)
	const view = new View(
		dot.process({path: "./templates"}),
		conf.http.host,
		conf.blog
	)
	const controller = new Controller (
		model,
		view,
		conf.http.port,
		conf.http.host
	)
	console.log(`Server listening to ${conf.http.host}:${conf.http.port}`)
}

main()
