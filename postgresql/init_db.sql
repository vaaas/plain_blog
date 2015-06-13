CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    published DATE NOT NULL,
    title VARCHAR(128) NOT NULL,
    categories VARCHAR(128)[],
    blurb TEXT NOT NULL DEFAULT '',
    contents TEXT NOT NULL
);
