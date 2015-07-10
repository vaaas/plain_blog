all: dirs nginx static blog service

dirs:
	sudo mkdir -p /usr/local/share/plain_blog/ \
		/usr/local/share/plain_blog/static/ \
		/usr/local/share/plain_blog/posts/;
	sudo chown -R node:node /usr/local/share/plain_blog/;

nginx:
	sudo install -m 644 -o root -g root nginx/plain_blog.conf /etc/nginx/conf.d/

static:
	sudo install -m 440 -o node -g node static/* /usr/local/share/plain_blog/static/

blog:
	sudo install -m 555 -o root -g root bin/* /usr/local/bin/;
	sudo install -m 644 -o root -g root etc/* /etc/;
	sudo install -m 640 -o node -g node templates/* /usr/local/share/plain_blog/;

service:
	sudo install -m 644 -o root -g root service/* /usr/lib/systemd/system/

.PHONY: blog static nginx dirs service all
