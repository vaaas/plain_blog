// jshint node:true
// jshint esnext:true
// jshint asi:true

"use strict"
const fs = require("fs")
const determine_mime_type = require("determine-mime-type")

function ResponseConf (code, headers, data) {
	this.code = code
	this.headers = headers
	this.data = data
}

module.exports = class View {
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
