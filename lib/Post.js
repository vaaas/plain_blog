// jshint node:true
// jshint esnext:true
// jshint asi:true
"use strict"

const fs = require("fs")
const path = require("path")
const cheerio = require("cheerio")

function array_to_object (arr) {
	let obj = {}
	for (let i = 0, len = arr.length; i < len; i++)
		obj[arr[i]] = i
	return obj
} 

module.exports = class Post {
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

