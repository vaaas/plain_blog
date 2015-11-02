# Plain blog

A very plain flat files dynamic blog, written in Javascript.

## Dependencies

- node.js
- dot.js, for rendering templates
- cheerio, for parsing the posts

## Configuration

A makefile is provided to ease and automate installation.
The main executable is installed in ```/usr/local/bin```,
shared data in ```/usr/local/share/plain_blog```,
and configuration is done through environment variables.

- The working directory is considered the root from where to look for files
- ```$HOST``` determines the hostname used
- ```$PORT``` determines the port used
- ```$TITLE``` determines the blog title
- ```$DESCRIPTION``` determines the blog description / byline
- ```$KEYWORDS``` determines the blog meta keywords (separated by commas)
- ```$AUTHOR``` determines the blog meta author
- ```$PPP``` determines the posts that are seen per page and in RSS

## Posting

There is no database. Information is extracted by parsing HTML files under
```/usr/local/share/plain_blog/posts``` and stored in-memory. The parser looks
out for the following elements:

- The first ```h1``` element, for the title.
- The section with id ```blurb``` for the summary / introduction.
- The contents of the ```body``` element are considered the post's contents.
- The ```meta``` keywords element for the post's categories / tags.
- The ```meta``` date element for the post's creation date.

Posts are sorted in reverse alphabetical order based on their file names.
Updating the cache is done by sending the HUP signal.
