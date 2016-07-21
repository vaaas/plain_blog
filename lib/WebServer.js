// jshint node:true
// jshint esnext:true
// jshint asi:true

"use strict"

const http = require("http")
const url = require("url")
const fs = require("fs")
const path = require("path")
const Model = require("./Model.js")
const View = require("./View.js")

module.exports = function WebServer (conf) {
	const port = conf.http.port
	const hostname = conf.http.host
	const model = new Model(conf)
	const view = new View(conf)
	init_process()
	const server = http.createServer(request_listener)
	server.listen(port, hostname)

	function init_process() {
		process.on("SIGHUP", model.update.bind(model))
		process.on("SIGTERM", quit)
		process.on("SIGINT", quit)
	}

	function quit() {
		console.log("Received SIGINT/SIGTERM. Exiting gracefully...")
		process.quit(0)
	}

	function match(req) {
		const p = req.url.pathname
		if (p === "/" || p === "/posts") {
			if (req.method !== "GET") return method_not_allowed
			else return get_posts_collection
		} else if (p.startsWith("/posts/")) {
			if (req.method !== "GET") return method_not_allowed
			else {
				req.params = [p.slice("/posts".length)]
				return get_posts_element
			}
		} else if (p.startsWith("/static/")) {
			if (req.method !== "GET") return method_not_allowed
			else {
				req.params = [p.slice("/static".length)]
				return get_static_element
			}
		} else if (p === "/feeds/rss.xml") {
			if (req.method !== "GET") return method_not_allowed
			else return get_rss_feed
		} else { return not_found }
	}

	function serve (res, conf) {
		res.writeHead(conf.code, conf.headers)
		if (conf.data.constructor === fs.ReadStream) conf.data.pipe(res)
		else res.end(conf.data)
	}

	function request_listener (req, res) {
		req.url = url.parse(req.url, true)
		req.url.basename = path.basename(req.url.pathname)
		match(req)(req, res)
	}

	function not_found (req, res) {
		serve(res, view.code(404))
	}

	function method_not_allowed (req,res) {
		serve(res, view.code(405))
	}

	function get_posts_collection (req, res) {
		let query = req.url.query
		const results = model.query(query)
		if (results.length > 0) {
			serve(res, view.post_list(results, query))
		} else {
			serve(res, view.empty_page())
		}
	}

	function get_posts_element (req, res) {
		let post = model.get_post(req.params[0])
		if (post !== undefined) {
			serve(res, view.post(post))
		} else {
			serve(res, view.empty_page())
		}
	}

	function get_static_element (req, res) {
		let pathname = path.join("./static", req.params[0])
		fs.access(pathname, fs.R_OK, (err) => {
			if (err) {
				serve(res, view.code(404, "Element doesn't exist"))
			} else {
				serve(res, view.file(pathname))
			}
		})
	}

	function get_rss_feed (req, res) {
		const results = model.query({})
		if (results.length === 0) {
			serve(res, view.code(404))
		} else {
			serve(res, view.rss(results))
		}
	}
}
