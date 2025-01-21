CREATE TABLE IF NOT EXISTS recipe
(
    "idx" INT PRIMARY KEY,
    "nickname" VARCHAR NOT NULL,
    "type" VARCHAR(8) NOT NULL,
    "weight" VARCHAR(128) NOT NULL,
    "selected" BOOL NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS history
(
    "idx" SERIAL PRIMARY KEY,
    "recipe_no" INT NOT NULL,
    "lane_no" INT NOT NULL,
    "item_no" BIGINT NOT NULL,
    "result" VARCHAR NOT NULL DEFAULT 'NG',
    "created_t" TIMESTAMP NOT NULL,
    
    CONSTRAINT history_recipe_fk FOREIGN KEY (recipe_no)
        REFERENCES recipe(idx) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS setting
(
    "idx" SERIAL PRIMARY KEY,
    "input_cnt" INT NOT NULL DEFAULT 180,
    "output_cnt" INT NOT NULL DEFAULT 180,
    "title" VARCHAR(128),
    "exp_white" INT not null DEFAULT 450,
    "exp_brown" INT not null DEFAULT 800
);

CREATE TABLE IF NOT EXISTS error
(
    "idx" SERIAL PRIMARY KEY,
    "type" VARCHAR NOT NULL,
    "message" VARCHAR NOT NULL
);

INSERT INTO setting (idx, title)
VALUES (1, 'temp')
ON CONFLICT (idx) DO NOTHING;
