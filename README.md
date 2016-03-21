# Plain blog

A very plain flat files dynamic blog, written in Javascript.

## Dependencies

- linux
- node.js >= 4.0
- dot.js, for rendering templates
- cheerio, for parsing the posts

Running ```npm install``` should install them all automatically.

## Configuration

The main executable is installed in ```/usr/local/bin```, and configuration is
done through environment variables.

- The working directory is considered the root from where to look for files
- ```$HOST``` determines the hostname used
- ```$PORT``` determines the port used
- ```$TITLE``` determines the blog title
- ```$DESCRIPTION``` determines the blog description / byline
- ```$KEYWORDS``` determines the blog meta keywords (separated by comma+space ```", "```)
- ```$AUTHOR``` determines the blog meta author
- ```$PPP``` determines the posts that are seen per page and in RSS
- ```$PASSWORD``` determines the password to use when posting over http

## Posting

There is no database. Information is extracted by parsing HTML files under
```$PWD/posts``` and stored in-memory. The parser looks out for the following
elements:

- The first ```h1``` element, for the title.
- The section with id ```blurb``` for the summary / introduction.
- The contents of the ```body``` element are considered the post's contents.
- The ```meta``` keywords element for the post's categories / tags.
- The ```meta``` date element for the post's creation date.

You can upload posts using ```rsync``` or ```scp``` or whatever it is you fancy best.

Posts are sorted in reverse alphabetical order based on their file names.
