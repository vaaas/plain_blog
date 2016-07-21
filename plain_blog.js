#!/usr/bin/env node
// jshint esnext:true
// jshint asi:true

"use strict"

const http = require("http")
const fs = require("fs")
const url = require("url")
const path = require("path")
const dot = require("dot")
const cheerio = require("cheerio")
const determine_mime_type = require("determine-mime-type")

function array_to_object (arr) {
	let obj = {}
	for (let i = 0, len = arr.length; i < len; i++)
		obj[arr[i]] = i
	return obj
} 

class ResponseConf {
	constructor (code, headers, data) {
		this.code = code
		this.headers = headers
		this.data = data
	}
}

class Post {
	constructor (pathname) {
		this.pathname = pathname
		this.basename = path.basename(this.pathname)
		this.mtime = fs.statSync(this.pathname).mtime

		let $ = cheerio.load(fs.readFileSync(pathname, {"encoding":"utf-8"}))
		this.title = $("h1:first-of-type").html().trim()
		this.blurb = $("#blurb").html().trim()
		this.content = $("body").html().trim()
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
		for (let i = 0, len = this.length; i < len; i++) {
			let cpath = path.join(this.pathname, np[i])
			if (!(cpath in np)) delete this.posts[this.sorted[i]]
		}
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

	query (q) {
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
		return results
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
	constructor (model, view, port, hostname) {
		this.model = model
		this.view = view
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

	match(req) {
		const p = req.url.pathname
		if (p === "/" || p === "/posts") {
			if (req.method !== "GET") return this.method_not_allowed
			else return this.get_posts_collection
		} else if (p.startsWith("/posts/")) {
			if (req.method !== "GET") return this.method_not_allowed
			else {
				req.params = [p.slice("/posts".length)]
				return this.get_posts_element
			}
		} else if (p.startsWith("/static/")) {
			if (req.method !== "GET") return this.method_not_allowed
			else {
				req.params = [p.slice("/static".length)]
				return this.get_static_element
			}
		} else if (p === "/feeds/rss.xml") {
			if (req.method !== "GET") return this.method_not_allowed
			else return this.get_rss_feed
		} else { return this.not_found }
	}

	serve (res, conf) {
		res.writeHead(conf.code, conf.headers)
		if (conf.data.constructor === fs.ReadStream) conf.data.pipe(res)
		else res.end(conf.data)
	}

	request_listener (req, res) {
		req.url = url.parse(req.url, true)
		req.url.basename = path.basename(req.url.pathname)
		this.match(req)(req, res)
	}

	not_found (req, res) {
		this.serve(res, this.view.code(404))
	}

	method_not_allowed (req,res) {
		this.serve(res, this.view.code(405))
	}

	get_posts_collection (req, res) {
		let query = req.url.query
		const results = this.model.query(query)
		if (results.length > 0) {
			this.serve(res, this.view.post_list(results, query))
		} else {
			this.serve(res, this.view.empty_page())
		}
	}

	get_posts_element (req, res) {
		let post = this.model.get(req.params[0])
		if (post !== undefined) {
			this.serve(res, this.view.post(post))
		} else {
			this.serve(res, this.view.empty_page())
		}
	}

	get_static_element (req, res) {
		let pathname = path.join("./static", req.params[0])
		fs.access(pathname, fs.R_OK, (err) => {
			if (err) {
				this.serve(res, this.view.code(404, "Element doesn't exist"))
			} else {
				this.serve(res, this.view.file(pathname))
			}
		})
	}

	get_rss_feed (req, res) {
		const results = this.model.query({})
		if (results.length === 0) {
			this.serve(res, this.view.code(404))
		} else {
			this.serve(res, this.view.rss(results))
		}
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
