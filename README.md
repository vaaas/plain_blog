# Plain blog

A very plain dynamic blog, written in Javascript.

## Dependencies

- node.js
- postgresql
- node-pg
- dot.js

## Configuration

A makefile is provided to ease and automate installation.
The main executable is installed in ```/usr/local/bin```,
its configuration file in ```/etc/```,
and shared data in ```/usr/local/share/plain_blog```.

```postgresql/init_db.sql``` will create the required database and tables.

An nginx configuration is provided,
but **it should not be considered production ready**,
merely an example.
Nginx is not a hard dependency, so you can use any web server you like.

Edit ```/etc/plain_blog.js``` to match your web server and postgres setup.

The administrator page can be accessed in ```/static/admin.html```.
By default, ```/admin``` will redirect there for convenience.

### Non-nginx servers

All requests should be forwarded to node.js, which listens to port ```50000```,
except for requests in the ```/static/``` subdirectory.
It's also a good idea to redirect ```/admin``` to ```/static/admin.html```.
