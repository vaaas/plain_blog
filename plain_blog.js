#!/usr/bin/env node
// jshint node:true
// jshint esnext:true
// jshint asi:true

"use strict"

const Conf = require("./lib/Conf.js")
const WebServer = require("./lib/WebServer.js")

function main () {
	const conf = new Conf()
	WebServer(conf)
	console.log(`Server listening to ${conf.http.host}:${conf.http.port}`)
}

main()
