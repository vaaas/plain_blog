var v = new Object();

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
    default:
        console.log("swag");
        break;
    }
}

function XHR (method, url, data) {
    var req = new XMLHttpRequest();
    req.onload = XHR_listener;
    req.open (method, url, true);
    req.setRequestHeader ("x-password", v.password);
    if (data)
        req.send (data);
    else
        req.send();
}

function render_posts_list (rows) {
    clear_children (v.elems["posts_table"]);
    for (var i = 0, len = rows.length; i < len; i++) {
        var row = document.createElement("tr");
        render_post_row (row, rows[i]);
        v.elems["posts_table"].appendChild(row);
    }
}

function render_post_row (parent, data) {
    var id = document.createElement("td");
    id.innerText = data.id;
    parent.appendChild (id);

    var title = document.createElement("td");
    title.innerText = data.title;
    parent.appendChild (title);

    var published = document.createElement("td");
    published.innerText = data.published.slice(0,10);
    parent.appendChild (published);

    var edit_button = document.createElement("input");
    edit_button.type = "submit";
    edit_button.value = "EDIT";
    edit_button.onClick = gen_edit_post_function (data.id);
    parent.appendChild (edit_button);

    var delete_button = document.createElement("input");
    delete_button.type = "submit";
    delete_button.value = "DELETE";
    delete_button.onClick = gen_delete_post_function (data.id);
    parent.appendChild(delete_button);
}

function gen_edit_post_function (id) {
    return function () { console.log (id); };
}

function gen_delete_post_function (id) {
    return function () { console.log (id); };
}

function post_entry () {
    XHR ("POST", "/admin/posts", JSON.stringify ({
        title: v.elems["post_title"].value,
        contents: v.elems["post_area"].value,
        categories: v.elems["post_categories"].value.split(" ")
    }));
}

function deactivate_nav () {
    v.elems["author_link"].className = "";
    v.elems["static_link"].className = "";
    v.elems["upload_link"].className = "";
    v.elems["posts_link"].className = "";

    v.elems["posts_list"].className = "";
    v.elems["post_author"].className = "";
    v.elems["static_list"].className = "";
    v.elems["static_author"].className = "";
}

function activate_posts_list () {
    deactivate_nav();
    v.elems["posts_list"].className = "active";
    v.elems["posts_link"].className = "active";
    XHR ("GET", "/admin/posts");
}

function activate_post_author () {
    deactivate_nav();
    v.elems["post_title"].value = "";
    v.elems["post_area"].value = "";
    v.elems["post_categories"].value = "";
    v.elems["post_author"].className = "active";
    v.elems["author_link"].className = "active";
}

function activate_static_list () {
    deactivate_nav();
    v.elems["static_list"].className = "active";
    v.elems["static_link"].className = "active";
}

function activate_static_author () {
    deactivate_nav();
    v.elems["static_author"].className = "active";
    v.elems["upload_link"].className = "active";
}

function main () {
    v.elems = {
        posts_list: document.querySelector ("#posts_list"),
        post_author: document.querySelector ("#post_author"),
        static_list: document.querySelector ("#static_list"),
        static_author: document.querySelector ("#static_author"),

        author_link: document.querySelector ("#author_link"),
        static_link: document.querySelector ("#static_link"),
        upload_link: document.querySelector ("#upload_link"),
        posts_link: document.querySelector ("#posts_link"),

        post_title: document.querySelector ("#post_title"),
        post_area: document.querySelector ("#post_author > textarea"),
        post_categories: document.querySelector ("#post_categories"),

        post_submit: document.querySelector ("#post_submit"),
        post_preview: document.querySelector ("#post_preview"),

        posts_table: document.querySelector ("#posts_list > table > tbody"),
    };

    v.elems["author_link"].onclick = activate_post_author;
    v.elems["static_link"].onclick = activate_static_list;
    v.elems["upload_link"].onclick = activate_static_author;
    v.elems["posts_link"].onclick = activate_posts_list;

    v.elems["post_submit"].onclick = post_entry;

    v.password = prompt ("Please enter the password");
}

window.onload = main;
