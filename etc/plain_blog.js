module.exports = {
	http: {
		port: 50000
	},
	auth: "password",
	pg: {
		constring: "postgres://postgres:password@localhost/plain_blog"
	},
	blog: {
		title: "Plain blog",
		description: "Plain blog is very plain",
		url: "blog.localhost",
		keywords: ["plain", "blog", "plain blog"],
		author: "Plain author"
	}
};
