/* jshint -W069 */
/* jshint -W010 */
/* jshint -W009 */
var v = new Object();
v.editing = null;

function clear_children (element) {
    while (element.hasChildNodes()) {
        element.removeChild(element.lastChild);
    }
}

function XHR_listener () {
    console.log (this.status);
    console.log (this.responseText);

    var obj = JSON.parse (this.responseText);

    switch (obj.type) {
    case "posts collection":
        render_posts_list (obj.data);
        break;
    case "files collection":
        render_files_list (obj.data);
        break;
    case "posts element":
        render_post_edit (obj.data);
        break;
    default:
        break;
    }
}

function XHR (method, url, data, callback) {
    var req = new XMLHttpRequest();
    req.onload = callback || XHR_listener;
    req.open (method, url, true);
    req.setRequestHeader ("x-password", v.password);
    if (data)
        req.send (data);
    else
        req.send();
}

function render_post_edit (data) {
    v.elems["post_title"].value = data.title;
    v.elems["post_area"].value = data.contents;
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
        XHR ("GET", "/admin/posts/" + id);
    };
}

function gen_delete_post_function (id, elem) {
    return function () {
        XHR ("DELETE", "/admin/posts/" + id);
        v.elems["posts_list"].removeChild (elem);
    };
}

function gen_delete_file_function (name, elem) {
    return function () {
        XHR ("DELETE", "/admin/files/" + name);
        v.elems["files_list"].removeChild (elem);
    };
}

function post_entry () {
    var data = JSON.stringify ({
        title: v.elems["post_title"].value,
        contents: v.elems["post_area"].value,
        categories: v.elems["post_categories"].value.split(" ")
    });
    if (v.editing === null) {
        XHR ("POST", "/admin/posts", data);
    } else {
        XHR ("PUT", "/admin/posts" + v.editing, data);
    }
}

function file_entry () {
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
            console.log(arr);
            XHR ("POST", "/admin/files", JSON.stringify(arr));
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
    XHR ("GET", "/admin/posts");
}

function activate_post_author () {
    deactivate_nav();
    v.elems["post_title"].value = "";
    v.elems["post_area"].value = "";
    v.elems["post_categories"].value = "";
    v.elems["post_author"].className = "active";
    v.elems["post_author_link"].className = "active";
    v.editing = null;
}

function activate_files_list () {
    deactivate_nav();
    v.elems["files_list"].className = "active";
    v.elems["files_list_link"].className = "active";
    XHR ("GET", "/admin/files");
}

function activate_file_author () {
    deactivate_nav();
    v.elems["file_author"].className = "active";
    v.elems["file_author_link"].className = "active";
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
        post_area: document.querySelector ("#post_author > textarea"),
        post_categories: document.querySelector ("#post_categories"),

        post_submit: document.querySelector ("#post_submit"),
        post_preview: document.querySelector ("#post_preview"),

        file_input: document.querySelector ("#file_author > input[type='file']"),
        file_submit: document.querySelector ("#file_author > input[type='submit']"),
    };

    v.elems["post_author_link"].onclick = activate_post_author;
    v.elems["file_author_link"].onclick = activate_file_author;
    v.elems["files_list_link"].onclick = activate_files_list;
    v.elems["posts_list_link"].onclick = activate_posts_list;

    v.elems["post_submit"].onclick = post_entry;
    v.elems["file_submit"].onclick = file_entry;

    v.password = prompt ("Please enter the password");
}

window.onload = main;
