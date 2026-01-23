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

let saveData = {};
let searchFeed = [];

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "library",
    password: "Ange1naruto",
    port: 5432
});

app.get("/", (req, res) => {
    saveData = {};
    res.render("index.ejs", { books: dummyBooks });
});

app.get("/add", (req, res) => {
    if (!searchFeed || searchFeed.length === 0) {
    return res.render("add.ejs");
  }

  res.render("add.ejs", { results: searchFeed });;
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

app.get("/save", async (req, res) => {
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
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});