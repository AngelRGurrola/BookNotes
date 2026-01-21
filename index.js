import express from "express";
import pg from "pg";
import bodyParser from "body-parser";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({extended: true}));
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

app.get("/", (req,res) => {
    res.render("index.ejs", { books: dummyBooks });
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});