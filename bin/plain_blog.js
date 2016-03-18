#!/usr/bin/env node
// jshint esnext:true
// jshint asi:true

"use strict"

// libraries
const http = require("http")
const fs = require("fs")
const url = require("url")
const path = require("path")
const dot = require("dot")
const cheerio = require("cheerio")

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

function array_to_object (arr) {
	let obj = {}
	for (let i = 0, len = arr.length; i < len; i++)
		obj[arr[i]] = i
	return obj
} 

// return the mime type of a file
function determine_mime_type (path) {
	let index = path.slice(path.lastIndexOf("."))
	let mime = mime_types[index]
	if (mime !== undefined) return mime
	else return "application/octet_stream"
}

class ResponseConf {
	constructor (code, headers, data) {
		this.code = code
		this.headers = headers
		this.data = data
	}
}

class Router extends Array {
	indexOf (regex) {
		for (var i = 0, len = this.length; i < len; i++)
			if (regex.toString() === this[i].regex.toString())
				return i
		return -1
	}

	add_route (method, regex, handler) {
		let i = this.indexOf(regex)
		if (i >= 0) this[i][method] = handler
		else {
			let obj = {}
			obj.regex = regex
			obj[method] = handler
			this.push(obj)
		}
	}

	match (req) {
		for (let i = 0, len = this.length; i < len; i++) {
			const params = this[i].regex.exec(req.url.pathname)
			if (params === null) continue
			else {
				params.shift()
				req.params = params
				return this[i][req.method]
			}
		}
		return null
	}
}

class Post {
	constructor (pathname) {
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

	has_category (category) {
		return (category in this.categories_hash)
	}
}

class Model {
	constructor (pathname, posts_per_page) {
		this.posts_per_page = posts_per_page
		this.pathname = pathname
		let posts = fs.readdirSync(this.pathname)
		this.posts = {}
		for (let i = 0, len = posts.length; i < len; i++)
			this.posts[posts[i]] = new Post(path.join(this.pathname, posts[i]))
		this.init_sorted()
	}

	update () {
		let np = fs.readdirSync(this.pathname)
		for (let i = 0, len = np.length; i < len; i++) {
			let cpath = path.join(this.pathname, np[i])
			if (!(cpath in this.posts))
				this.posts[cpath] = new Post(cpath)
			else if (fs.statSync(cpath).mtime !== this.posts[cpath].mtime)
				this.posts[cpath] = new Post(cpath)
		}
		for (i = 0, len = this.length; i < len; i++)
			if (!(cpath in np)) delete this.posts[this.sorted[i]]
		this.init_sorted()
	}

	init_sorted () {
		this.sorted = Object.keys(this.posts)
		this.sorted.sort()
		this.sorted.reverse()
		this.length = this.sorted.length
		for (let i = 0; i < this.length; i++)
			this.posts[this.sorted[i]].id = i
	}

	query (q, callback) {
		let results = []
		let i = 0
		let step = 1
		let counter = this.posts_per_page
		if (q.newer) {
			q.newer = parseInt(q.newer, 10)
			if (Number.isInteger(q.newer)) {
				i = q.newer - 1
				step = -1
			}
		} else if (q.older) {
			q.older = parseInt (q.older, 10)
			if (Number.isInteger(q.older)) i = q.older + 1
		}
		if (q.category) {
			let cpost
			for (; i >= 0 && i < this.length && counter > 0; i += step) {
				cpost = this.posts[this.sorted[i]]
				if (cpost.has_category(q.category)) {
					results.push(cpost)
					counter -= 1
				}
			}
		} else {
			for (; i >= 0 && i < this.length && counter > 0; i += step) {
				results.push(this.posts[this.sorted[i]])
				counter -= 1
			}
		}
		if (step === -1) results.reverse()
		callback(results)
	}

	exists (post) {
		return (post in this.posts)
	}

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
	constructor (model, view, port, hostname, password) {
		this.model = model
		this.view = view
		this.password = password
		this.router = this.init_router()
		this.init_process()
		this.server = http.createServer(this.request_listener.bind(this))
		this.server.listen(port, hostname)
	}

	init_process() {
		process.on("SIGHUP", this.model.update.bind(this.model))
		process.on("SIGTERM", this.quit.bind(this))
		process.on("SIGINT", this.quit.bind(this))
	}

	quit() {
		console.log("Received SIGINT/SIGTERM. Exiting gracefully...")
		process.quit(0)
	}

	init_router () {
		const router = new Router()
		router.add_route("GET", RegExp("^/$"), this.get_posts_collection.bind(this))
		router.add_route("PUT", RegExp("^(.+)$"), this.upload.bind(this))
		router.add_route("GET", RegExp("^/posts$"), this.get_posts_collection.bind(this))
		router.add_route("GET", RegExp("^/posts/(.+)$"), this.get_posts_element.bind(this))
		router.add_route("GET", RegExp("^/static/(.+)$"), this.get_static_element.bind(this))
		router.add_route("GET", RegExp("^/feeds/rss.xml$"), this.get_rss_feed.bind(this))
		return router
	}

	// serve a response
	// conf: a response configuration object
	serve (res, conf) {
		res.writeHead(conf.code, conf.headers)
		if (conf.data.constructor === fs.ReadStream) conf.data.pipe(res)
		else res.end(conf.data)
	}

	request_listener (req, res) {
		req.url = url.parse(req.url, true)
		req.url.basename = path.basename(req.url.pathname)
		let match = this.router.match(req)
		if (match === null)
			this.serve(res, this.view.code(404))
		else if (match === undefined)
			this.serve(res, this.view.code(405))
		else
			match(req, res)
	}

	authorised (req) {
		return (req.url.query.password === this.password)
	}

	create_directories(dirname) {
		try {
			fs.mkdirSync(dirname, 0o710)
		} catch(e) {
			if (e.code === "ENOENT") {
				this.create_directories(path.dirname(dirname))
				this.create_directories(dirname)
			}
		}
	}

	upload (req, res) {
		if (!this.authorised(req))
			return this.serve(res, this.view.code(403, "wrong password"))
		const pathname = path.join(".", req.params[0])
		try {
			this.create_directories(path.dirname(pathname))
		} catch(e) {
			return this.serve(res, this.view.code(500, ""+e))
		}
		let stream
		try {
			stream = fs.createWriteStream(pathname, {
				flags: "w",
				defaultEncoding: "binary",
				mode: 0o640
			})
		} catch(e) {
			return this.serve(res, this.view.code(500, ""+e))
		}
		req.pipe(stream)
		req.on("end", () => {
			if (pathname.startsWith("/posts/") this.model.update()
			this.serve(res, this.view.code(200, pathname))
		})
	}

	get_posts_collection (req, res) {
		let query = req.url.query
		this.model.query(query, (results) => {
			if (results.length > 0) {
				this.serve(res, this.view.post_list(results, query))
			} else {
				this.serve(res, this.view.empty_page())
			}
		})
	}

	get_posts_element (req, res) {
		let post = this.mode.exists(req.params[0])
		if (post !== undefined) {
			this.serve(res, this.view.post(post))
		} else {
			this.serve(res, this.view.empty_page())
		}
	}

	get_static_element (req, res) {
		let pathname = path.join("./static", req.params[0])
		fs.exists(pathname, (exists) => {
			if (!exists) {
				this.serve(res, this.view.code(404, "Element doesn't exist"))
			} else {
				this.serve(res, this.view.file(pathname))
			}
		})
	}

	get_rss_feed (req, res) {
		this.model.query({}, (results) => {
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
			description: process.env.DESCRIPTION || "User didn't configure blog description",
			keywords: process.env.KEYWORDS ? process.env.KEYWORDS.split(", ") : ["user didn't configure blog keywords"],
			author: process.env.AUTHOR || "User didn't configure blog author",
			posts_per_page: process.env.PPP || 10,
		},
		password: process.env.PASSWORD || "password"
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
		conf.http.host,
		conf.password
	)
	console.log(`Server listening to ${conf.http.host}:${conf.http.port}`)
}

main()
