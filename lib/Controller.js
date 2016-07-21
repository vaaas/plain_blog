// jshint node:true
// jshint esnext:true
// jshint asi:true

"use strict"

const http = require("http")
const url = require("url")
const fs = require("fs")
const path = require("path")

module.exports = class Controller {
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
		let post = this.model.get_post(req.params[0])
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
