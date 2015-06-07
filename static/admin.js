/* jshint -W009 */
/* jshint -W010 */
/* jshint -W069 */

var v = new Object();
v.editing = null;

function clear_children (element) {
	while (element.hasChildNodes()) {
		element.removeChild(element.lastChild);
	}
}

function XHR (method, url, data, callback) {
	var req = new XMLHttpRequest();
	req.open (method, url, true);
	req.setRequestHeader ("x-password", v.password);
	
	req.onload = callback;
	req.onloadstart = show_progress;
	req.onloadend = hide_progress;
	req.onprogress = update_progress;
	
	if (data)
		req.send (data);
	else
		req.send();
}

function render_post_edit (data) {
	v.elems["post_title"].value = data.title;
	v.elems["post_blurb"].value = data.blurb;
	v.elems["post_content"].value = data.contents;
	v.elems["post_categories"].value = data.categories.join(" ");
	v.editing = data.id;
}

function render_files_list (rows) {
	clear_children (v.elems["files_list"]);
	for (var i = 0, len = rows.length; i < len; i++) {
		var row = document.createElement("li");
		render_file_row (row, rows[i]);
		v.elems["files_list"].appendChild(row);
	}
}

function render_file_row (parent, data) {
	var filename = document.createElement("h1");
	var link = document.createElement("a");
	link.innerText = data;
	link.href = "/" + data;
	filename.appendChild (link);
	parent.appendChild (filename);

	var delete_button = document.createElement("a");
	delete_button.href ="#";
	delete_button.innerText = "DELETE";
	delete_button.onclick = gen_delete_file_function (data, parent);

	parent.appendChild (delete_button);
}

function render_posts_list (rows) {
	clear_children (v.elems["posts_list"]);
	for (var i = 0, len = rows.length; i < len; i++) {
		var row = document.createElement("li");
		render_post_row (row, rows[i]);
		v.elems["posts_list"].appendChild(row);
	}
}

function render_post_row (parent, data) {
	var title = document.createElement("h1");
	var title_link = document.createElement("a");
	title_link.innerText = data.title;
	title_link.href = "/posts/" + data.id;
	title.appendChild(title_link);
	parent.appendChild (title);

	var container = document.createElement("div");

	var published = document.createElement("span");
	published.innerText = data.published.slice(0,10);
	container.appendChild (published);

	var edit_button = document.createElement("a");
	edit_button.href = "#";
	edit_button.innerText = "EDIT";
	edit_button.onclick = gen_edit_post_function (data.id);
	container.appendChild(edit_button);

	var delete_button = document.createElement("a");
	delete_button.href = "#";
	delete_button.innerText = "DELETE";
	delete_button.onclick = gen_delete_post_function (data.id, parent);
	container.appendChild (delete_button);

	parent.appendChild (container);
}

function gen_edit_post_function (id) {
	return function () {
		activate_post_author ();
		XHR ("GET", "/admin/posts/" + id, null, function () {
			if (this.status === 200) {
				var obj =  this.responseText ? JSON.parse (this.responseText) : new Object ();
				render_post_edit (obj);
			} else {
				//todo
			}
		});
	};
}

function gen_delete_post_function (id, elem) {
	return function () {
		XHR ("DELETE", "/admin/posts/" + id, null, function () {
			if (this.status === 200) {
				v.elems["posts_list"].removeChild (elem);
			} else {
				//todo
			}
		});
	};
}

function gen_delete_file_function (name, elem) {
	return function () {
		XHR ("DELETE", "/admin/files/" + name, null, function () {
			if (this.status === 200) {
				v.elems["files_list"].removeChild (elem);
			} else {
				//todo
			}
		});
	};
}

function post_entry () {
	function DRY () {
		if (this.status === 200) {
			//todo
			deactivate_nav ();
		} else {
			//todo
		}
	}
	var data = JSON.stringify ({
		title: v.elems["post_title"].value,
		blurb: v.elems["post_blurb"].value,
		contents: v.elems["post_content"].value,
		categories: v.elems["post_categories"].value.split(" ")
	});
	if (v.editing === null) {
		XHR ("POST", "/admin/posts", data, DRY);
	} else {
		XHR ("PUT", "/admin/posts" + v.editing, data, DRY);
	}
}

function file_entry () {
	if (v.elems["file_input"].files.length === 0) {
		return show_dialog (info_dialog ("Please select at least one file."));
	}

	var reader = new FileReader();
	var arr = new Array();
	var i = 0;
	var len = v.elems["file_input"].files.length;
	var file = v.elems["file_input"].files.item(i);

	reader.onloadend = function () {
		arr.push ({
			name: file.name,
			data: reader.result.split(",")[1]
		});
		i += 1;
		file = v.elems["file_input"].files.item(i);
		if (i < len) {
			read_file();
		} else {
			XHR ("POST", "/admin/files", JSON.stringify(arr), function () {
				if (this.status === 200) {
					deactivate_nav();
					//todo
				} else {
					//todo
				}
			});
		}
	};

	function read_file () {
		reader.readAsDataURL(file);
	}

	read_file();
}

function deactivate_nav () {
	v.elems["post_author_link"].className = "";
	v.elems["files_list_link"].className = "";
	v.elems["file_author_link"].className = "";
	v.elems["posts_list_link"].className = "";

	v.elems["posts_list"].className = "";
	v.elems["post_author"].className = "";
	v.elems["files_list"].className = "";
	v.elems["file_author"].className = "";
}

function activate_posts_list () {
	deactivate_nav();
	v.elems["posts_list"].className = "active";
	v.elems["posts_list_link"].className = "active";
	XHR ("GET", "/admin/posts", null, function () {
		if (this.status === 200) {
			var obj =  this.responseText ? JSON.parse (this.responseText) : new Object ();
			render_posts_list (obj);
		} else {
			//todo
		}
	});
}

function activate_post_author () {
	deactivate_nav();
	v.elems["post_title"].value = "";
	v.elems["post_blurb"].value = "";
	v.elems["post_content"].value = "";
	v.elems["post_categories"].value = "";
	v.elems["post_author"].className = "active";
	v.elems["post_author_link"].className = "active";
	v.editing = null;
}

function activate_files_list () {
	deactivate_nav();
	v.elems["files_list"].className = "active";
	v.elems["files_list_link"].className = "active";
	XHR ("GET", "/admin/files", null, function () {
		if (this.status === 200) {
			var obj =  this.responseText ? JSON.parse (this.responseText) : new Object ();
			render_files_list (obj);
		} else {
			//todo
		}
	});
}

function activate_file_author () {
	deactivate_nav();
	v.elems["file_author"].className = "active";
	v.elems["file_author_link"].className = "active";
}

function show_dialog (init_function) {
	if (v.dialog_timeout !== null) {
		clearTimeout (v.dialog_timeout);
		v.dialog_timeout = null;
	}
	if (v.elems["dialog"].hasChildNodes()) {
		clear_children (v.elems["dialog"]);
	}
	v.elems["dialog-backdrop"].style.display = "block";
	v.elems["dialog"].style.display = "block";
	init_function (v.elems["dialog"]);
	v.elems["dialog-backdrop"].className = "end";
	v.elems["dialog"].className = "end";
}

function hide_dialog () {
	v.elems["dialog-backdrop"].className = "";
	v.elems["dialog"].className = "";
	v.dialog_timeout = setTimeout (function () {
		v.elems["dialog-backdrop"].style.display = "none";
		v.elems["dialog"].style.display = "none";
		clear_children(v.elems["dialog"]);
		v.dialog_timeout = null;
	}, 200);
}

function password_dialog (dialog) {
	function send_password () {
		v.password = password.value;
		XHR ("GET", "/admin/auth", null, response_listener);
		hide_dialog ();
		return false;
	}
	
	function response_listener () {
		switch (this.status) {
		case 200:
			show_dialog (info_dialog ("Authentication successful."));
			break;
		default:
			show_dialog (info_dialog ("Invalid password.", function () {
				show_dialog (password_dialog);
			}));
			break;
		}
	}
	
	var form = document.createElement ("form");
	
	var password = document.createElement ("input");
	password.type = "password";
	password.placeholder = "Password";
	
	var submit = document.createElement ("input");
	submit.type = "submit";
	submit.value = "SUBMIT";
	submit.className = "accent";
	
	form.appendChild (password);
	form.appendChild (submit);
	
	form.onsubmit = send_password;
	
	dialog.appendChild (form);
	
	password.focus();
}

function info_dialog (text, callback) {
	return function (dialog) {
		var info = document.createElement ("div");
		info.innerText = text;
		
		var container = document.createElement ("div");
		container.className = "input_container";
		
		var ok = document.createElement ("input");
		ok.type = "submit";
		ok.value = "OK";
		ok.className = "accent";
		ok.onclick = function () {
			hide_dialog();
			if (callback) { callback (this); }
		};
		
		container.appendChild (ok);
		dialog.appendChild (info);
		dialog.appendChild (container);
		
		ok.focus();
	};
}

function show_progress () {
	v.progress = 0;
	v.elems["progressbar"].style.display = "block";
	v.elems["progressbar"].style.width = "0";
}

function hide_progress () {
	v.elems["progressbar"].style.width = "100%";
	setTimeout (function () {
		v.progress = 0;
		v.elems["progressbar"].style.display = "none";
		v.elems["progressbar"].style.width = "0";
	}, 200);
}

function update_progress () {
	switch (v.progress) {
	case 0:
		v.progress = 25;
		break;
	case 25:
		v.progress = 50;
		break;
	default:
		v.progress = (v.progress + 100) / 2;
		break;
	}
	v.elems["progressbar"].style.width = String (v.progress) + "%";
}

function main () {
	v.elems = {
		posts_list: document.querySelector ("#posts_list"),
		post_author: document.querySelector ("#post_author"),
		files_list: document.querySelector ("#files_list"),
		file_author: document.querySelector ("#file_author"),

		posts_list_link: document.querySelector ("#posts_list_link"),
		post_author_link: document.querySelector ("#post_author_link"),
		files_list_link: document.querySelector ("#files_list_link"),
		file_author_link: document.querySelector ("#file_author_link"),

		post_title: document.querySelector ("#post_title"),
		post_blurb: document.querySelector ("#post_author > #blurb"),
		post_content: document.querySelector ("#post_author > #content"),
		post_categories: document.querySelector ("#post_categories"),

		post_submit: document.querySelector ("#post_submit"),
		post_preview: document.querySelector ("#post_preview"),

		file_input: document.querySelector ("#file_author > input[type='file']"),
		file_submit: document.querySelector ("#file_author > input[type='submit']"),
		
		"dialog-backdrop": document.querySelector ("#backdrop"),
		dialog: document.querySelector ("#dialog"),
		progressbar: document.querySelector ("#progressbar"),
	};

	v.elems["post_author_link"].onclick = activate_post_author;
	v.elems["file_author_link"].onclick = activate_file_author;
	v.elems["files_list_link"].onclick = activate_files_list;
	v.elems["posts_list_link"].onclick = activate_posts_list;

	v.elems["post_submit"].onclick = post_entry;
	v.elems["file_submit"].onclick = file_entry;

	show_dialog (password_dialog);
}

window.onload = main;
