# Plain blog

A very plain flat files dynamic blog, written in Javascript.

## Dependencies

- node.js
- dot.js, for rendering templates
- cheerio, for parsing the posts

## Configuration

A makefile is provided to ease and automate installation.
The main executable is installed in ```/usr/local/bin```,
its configuration file in ```/etc/```,
and shared data in ```/usr/local/share/plain_blog```.

Usage is possible either as a module (```require```) or stand-alone.
Edit ```/etc/plain_blog.js``` to match your preferences.

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
