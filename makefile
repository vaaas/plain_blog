all: dirs nginx static blog

dirs:
	sudo mkdir -p /usr/local/share/blog/ /usr/local/share/blog/templates /usr/local/share/blog/static
	sudo chown -R node:node /usr/local/share/blog/

nginx:
	sudo install -m 644 -o root -g root nginx/blog.conf /etc/nginx/conf.d/

static:
	sudo install -m 440 -o node -g node static/* /usr/local/share/blog/static/

blog:
	sudo install -m 640 -o node -g node node/template.html /usr/local/share/blog/

.PHONY: blog static nginx dirs all
