// jshint node:true
// jshint esnext:true
// jshint asi:true
"use strict"

const fs = require("fs")
const path = require("path")
const Post = require("./Post.js")

module.exports = class Model {
	constructor (conf) {
		this.posts_per_page = conf.blog.posts_per_page
		this.pathname = "./posts"
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

	get_post (post) {
		return this.posts[post]
	}
}

