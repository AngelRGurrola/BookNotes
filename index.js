import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let dummyBooks = [{
    id: 12345,
    title: "Things Fall Apart",
    author: "Chinua Achebe",
    publisher: "Penguin",
    publication: "1965",
    page_count: 223,
    rating: 3,
    quick_summary: "THIS BOOK IS GREAT"
}];

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "library",
    password: "Ange1naruto",
    port: 5432
});

app.get("/", (req, res) => {
    res.render("index.ejs", { books: dummyBooks });
});

app.get("/add", (req, res) => {
    res.render("add.ejs");
});

app.post("/add", async (req, res) => {
    let URL = "https://openlibrary.org/search.json?";
    const searchType = req.body.searchType;
    const searchValue = req.body.query;

    URL = URL + `${searchType}=${searchValue}&limit=10`;
    // console.log(URL);

    try {
        const result = await axios.get(URL)
        const books = result.data.docs.map(book => ({
            title: book.title,
            author: book.author_name?.[0] || "Unknown",
            cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
                : "/images/no-cover.png",
            year: book.first_publish_year
        }));
        // console.log(books);
        return res.render("add.ejs", { results: books });
        
    } catch (error) {
        console.log(error);
    }

    res.render("add.ejs")
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});