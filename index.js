import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import axios from "axios";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

let saveData = {};
let searchFeed = [];

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT
});

db.connect();

// ------------------------------------- GET -------------------------------------------------

app.get("/", (req, res) => {
    res.render("home.ejs");
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) return next(err);
        res.redirect("/");
    });
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

app.get("/book", async (req, res) => {
    console.log(req.user);
    if (req.isAuthenticated()) {
        saveData = {};

        const result = await db.query(`SELECT * FROM books, images, notes, opinions
        WHERE books.id = images.book_id
        AND books.id = notes.book_id
        AND books.id = opinions.book_id
        ORDER BY books.id DESC;`
        );

        res.render("index.ejs", { books: result.rows });
    } else {
        res.redirect("/login");
    }

});

app.get("/info/:id", async (req, res) => {
    if (requ.isAuthenticated()) {
        const id = req.params.id;
        try {
            const result = await db.query(`
            SELECT 
                b.id,
                b.title,
                b.author,
                b.publisher,
                b.publication,
                b.page_count,
                b.isbn,
                i.book_img,
                o.comment,
                o.score,
                o.date_read,
                n.content AS notes
            FROM books b
            LEFT JOIN images i ON i.book_id = b.id
            LEFT JOIN opinions o ON o.book_id = b.id
            LEFT JOIN notes n ON n.book_id = b.id
            WHERE b.id = $1
            `,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).send("book not found");
            }

            res.render("info.ejs", { book: result.rows[0] });
        } catch (error) {
            console.log(error);
            res.status(500).send("Server Error");
        }
    } else {
        res.redirect("/login");
    }

});

app.get("/add", (req, res) => {
    if (req.isAuthenticated()) {
        if (!searchFeed || searchFeed.length === 0) {
            return res.render("add.ejs");
        }

        res.render("add.ejs", { results: searchFeed });;
    } else {
        res.redirect("/login");
    }

});

app.get("/save", async (req, res) => {
    if (req.isAuthenticated()) {
        const index = req.query.key;
        saveData = searchFeed[index];
        // console.log(`https://openlibrary.org/${saveData.work_key}/editions.json`);
        try {
            const result = await axios.get(`https://openlibrary.org/${saveData.work_key}/editions.json`);

            let edition = result.data.entries.find(e => e.isbn_13 || e.isbn_10);
            saveData.isbn = edition.isbn_13?.[0] || edition.isbn_10?.[0]

            edition = result.data.entries.find(e => e.publishers);
            saveData.isbn = edition ? (edition.isbn_13?.[0] || edition.isbn_10?.[0]) : null;
            saveData.page_count = edition ? (edition.number_of_pages || edition.pagination) : null;
            saveData.publisher = edition ? edition.publishers?.[0] : null;

            res.render("entry.ejs", { book: saveData });

        } catch (error) {
            console.log(error);
            res.redirect("/add");
        }
    } else {
        req.redirect("/login");
    }

});

app.get("/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"],
}));

app.get("/auth/google/book", passport.authenticate("google", {
    successRedirect: "/book",
    failureRedirect: "/login"
}));

// ------------------------------------- POST -------------------------------------------------

app.post("/login", passport.authenticate("local", {
    successRedirect: "/book",
    failureRedirect: "/login",
}))

app.post("/register", async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    try {
        const checkResult = await db.query("SELECT * FROM users where email = $1", [email]);
        if (checkResult.rows.length > 0) {
            req.redirect("/login");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                } else {
                    const result = await db.query("INSERT INTO users (email,password) VALUES ($1, $2);",
                        [email, hash]);
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log("Registration Complete")
                        res.redirect("/book");
                    });
                }
            });
        }
    } catch (error) {
        console.log(error);
    }

});

app.post("/edit", async (req, res) => {
    const id = req.body.updatedBookId;
    const score = req.body.updatedScore;
    const comment = req.body.updatedComment;
    const notes = req.body.updatedNotes

    try {
        await db.query("BEGIN");

        await db.query(
            `UPDATE opinions SET score=$1, comment=$2 WHERE book_id=$3`,
            [score, comment, id]
        );

        await db.query(
            `UPDATE notes SET content=$1 WHERE book_id=$2`,
            [notes, id]
        );

        await db.query("COMMIT");
        res.redirect("/book");
    } catch (err) {
        await db.query("ROLLBACK");
        console.error(err);
    }
});



app.post("/add", async (req, res) => {
    searchFeed = [];
    let URL = "https://openlibrary.org/search.json?";
    const searchType = req.body.searchType;
    const searchValue = req.body.query;
    let item = 0;

    URL = URL + `${searchType}=${searchValue}&limit=10`;
    // console.log(URL);

    try {
        const result = await axios.get(URL)
        // console.log(result.data.docs);
        const books = result.data.docs.map(book => ({
            title: book.title,
            authors: book.author_name?.join(", ") || "Unknown",
            book_img: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
                : "/images/no-cover.png",
            year: book.first_publish_year,
            work_key: book.key,
            item: item++
        }));
        searchFeed = books;
        return res.render("add.ejs", { results: books });

    } catch (error) {
        console.log(error);
    }

    res.render("add.ejs")
});



app.post("/save", async (req, res) => {
    try {
        saveData.comment = req.body.impression;
        saveData.notes = req.body.notes;
        saveData.date_read = req.body.data_read;
        saveData.score = req.body.score;
        // console.log(saveData);

        const bookResult = await db.query(
            `INSERT INTO books (title, author, publisher, publication, page_count, work_key, isbn)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
            [
                saveData.title,
                saveData.authors,
                saveData.publisher,
                saveData.year,
                saveData.page_count,
                saveData.work_key,
                saveData.isbn
            ]
        );

        const bookId = bookResult.rows[0].id;

        await db.query(
            "INSERT INTO notes (book_id, content) VALUES ($1, $2)",
            [bookId, saveData.notes]
        );

        await db.query(
            "INSERT INTO opinions (book_id, comment, score, date_read) VALUES ($1, $2, $3, $4)",
            [bookId, saveData.comment, saveData.score, saveData.date_read + "-01"]
        );

        await db.query(
            "INSERT INTO images (book_id, book_img) VALUES ($1, $2)",
            [bookId, saveData.book_img]
        );

        res.redirect("/book");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.post("/delete", async (req, res) => {
    const id = req.body.deletedBookId;
    try {
        await db.query("DELETE FROM opinions WHERE book_id = $1", [id]);
        await db.query("DELETE FROM notes WHERE book_id = $1", [id]);
        await db.query("DELETE FROM images WHERE book_id = $1", [id]);
        await db.query("DELETE FROM books WHERE id = $1", [id]);
        res.redirect("/book");
    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error")
    }
});

passport.use("local",
    new Strategy(async function verify(email, password, cb) {
        try {
            const result = await db.query("SELECT * FROM users WHERE email = $1",
                [email]
            );
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const storedHashedPassword = user.password;
                bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                    if (err) {
                        // error with password check
                        console.error("Error comparing passwords:", err);
                        return cb(err);
                    } else {
                        if (valid) {
                            // password check is passed
                            return cb(null, user);
                        } else {
                            // did not pass pasword check
                            return cb(null, false);
                        }
                    }
                });
            } else {
                console.log("User not found");
                return cb(null, false);
            }
        } catch (error) {
            console.log(error);
        }
    }));

passport.use("google",
    new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT,
        clientSecret: process.env.GOOGLE_SECRET,
        callbackURL: "http://localhost:3000/auth/google/book",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
    },
        async (accessToken, refreshToken, profile, cb) => {
            console.log(profile);
            try {
                const result = await db.query("SELECT * FROM users WHERE email = $1;",
                    [profile.email]
                );

                if (result.rows.length === 0) {
                    const newUser = await db.query("INSERT INTO users (email, password) VALUES ($1, $2);",
                        [profile.email, "google"]
                    );
                    cb(null, newUser.rows[0]);
                } else {
                    cb(null, result.rows[0]);
                }
            } catch (error) {
                cb(error);
            }
        }
    )
);

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});