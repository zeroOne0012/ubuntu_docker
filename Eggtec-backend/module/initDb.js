const pool = require("./postgres");
const { errorLog, errorLogLocal } = require("./errorLog");

const createTables = async () => {
  const query = `    
    CREATE TABLE if not exists recipe
    (
        "idx" INT PRIMARY KEY,
        "nickname" VARCHAR NOT NULL,
        "type" VARCHAR(8) NOT NULL,
        "weight" VARCHAR(128) NOT NULL,
        "selected" BOOL NOT NULL DEFAULT false
    );

    CREATE TABLE if not exists history
    (
        "idx" SERIAL PRIMARY KEY,
        "recipe_no" INT NOT NULL,
        "item_no" INT NOT NULL,
        "lane1" SMALLINT NOT NULL DEFAULT -1,
        "lane2" SMALLINT NOT NULL DEFAULT -1,
        "lane3" SMALLINT NOT NULL DEFAULT -1,
        "lane4" SMALLINT NOT NULL DEFAULT -1,
        "lane5" SMALLINT NOT NULL DEFAULT -1,
        "lane6" SMALLINT NOT NULL DEFAULT -1,
        "created_t" TIMESTAMP NOT NULL DEFAULT now(),
        
        CONSTRAINT history_recipe_fk FOREIGN KEY (recipe_no) REFERENCES recipe(idx) ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE if not exists setting
    (
      "idx" SERIAL PRIMARY KEY,
      "output_cnt" INT NOT NULL DEFAULT 180,
      "title" VARCHAR(128),
      "exp_white" INT NOT NULL DEFAULT 450,
      "exp_brown" INT NOT NULL DEFAULT 800,
      "y1" INT NOT NULL DEFAULT 0,
      "y2" INT NOT NULL DEFAULT 1,
      "y3" INT NOT NULL DEFAULT 0,
      "y4" INT NOT NULL DEFAULT 1
    );

    CREATE TABLE if not exists error
    (
        "idx" SERIAL PRIMARY KEY,
        "type" VARCHAR NOT NULL,
        "message" VARCHAR NOT NULL,
        "created_t" TIMESTAMP NOT NULL DEFAULT now()
    );
    
    `;
    // INSERT INTO setting (idx, title)
    // VALUES (1, 'temp')
    // ON CONFLICT (idx) DO NOTHING;
    
    // CREATE OR REPLACE FUNCTION ensure_single_true()
    // RETURNS TRIGGER AS $$
    // BEGIN
    //     IF NEW.selected THEN
    //         UPDATE recipe
    //         SET selected = FALSE
    //         WHERE idx <> NEW.idx;
    //     END IF;
    //     RETURN NEW;
    // END;
    // $$ LANGUAGE plpgsql;
    
    // CREATE TRIGGER set_single_active
    // AFTER UPDATE OF selected ON recipe
    // FOR EACH ROW
    // WHEN (NEW.selected = TRUE)
    // EXECUTE FUNCTION ensure_single_true();

  let client;
  try{
    client = await pool.connect();
  } catch(error){
    errorLogLocal("initDb.js", 0, error.message);
    return;
  }

  try {
    await client.query(query);
  } catch (error) {
    errorLog("initDb.js", 1, error.message);
    console.error(error);
  } finally{
    if(client) client.release();
  }
};

module.exports = createTables;