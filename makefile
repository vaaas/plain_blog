all: nginx static

dirs:
	sudo mkdir -p /usr/local/share/www/blog/
	sudo chown -R nginx:nginx /usr/local/share/www/blog/

nginx:
	sudo install -m 644 -o root -g root blog.conf /etc/nginx/conf.d/

static:
	sudo install -m 440 -o nginx -g nginx static/* /usr/local/share/www/blog/
