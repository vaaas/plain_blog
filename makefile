all: dirs nginx static blog service

dirs:
	sudo mkdir -p /usr/local/share/plain_blog/ /usr/local/share/plain_blog/static
	sudo chown -R node:node /usr/local/share/plain_blog/

nginx:
	sudo install -m 644 -o root -g root nginx/plain_blog.conf /etc/nginx/conf.d/

static:
	sudo install -m 440 -o node -g node static/* /usr/local/share/plain_blog/static/

blog:
	sudo install -m 640 -o node -g node node/template.html /usr/local/share/plain_blog/
	sudo install -m 555 -o root -g root node/plain_blog.js /usr/local/bin/

service:
	sudo install -m 644 -o root -g root service/* /usr/lib/systemd/system/

.PHONY: blog static nginx dirs service all
