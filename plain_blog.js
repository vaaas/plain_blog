#!/usr/bin/env node
// jshint esnext:true
// jshint asi:true

"use strict"

const dot = require("dot")
const Conf = require("./lib/Conf.js")
const Controller = require("./lib/Controller.js")
const Model = require("./lib/Model.js")
const View = require("./lib/View.js")

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
