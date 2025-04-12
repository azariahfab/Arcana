const fs = require('fs'); 
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); 
const app = express();
const PORT = 3000;

const BEARER_TOKEN = process.env.BEARER_TOKEN;

// Load data from file or initialize
let data;
try {
  data = fs.existsSync('data.json') ?
    JSON.parse(fs.readFileSync('data.json')) :
    { tweets: [], likes: {}, comments: {}, bookmarks: {} };
} catch (e) {
  console.error("❌ Error loading data.json. Reinitializing blank data.");
  data = { tweets: [], likes: {}, comments: {}, bookmarks: {} };
}

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

app.use((req, res, next) => {
  req.anonymousId = req.headers['anonymous-id'] || null;
  next();
});

// Auto-save data every 5 minutes
setInterval(() => {
  fs.writeFileSync('data.json', JSON.stringify(data));
}, 300000);

//
// ✅ TWITTER API PROXY
//
app.get('/api/tweets', async (req, res) => {
  try {
    const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
      params: {
        query: 'from:YourTwitterHandle', // OR use a hashtag like "#arcana"
        max_results: 10,
        'tweet.fields': 'created_at'
      },
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch tweets' });
  }
});

//
// ✅ POST CONFESSION
//
app.post('/api/tweets', (req, res) => {
  const { text, tag, anonymousId } = req.body;

  if (!anonymousId) {
    return res.status(401).json({ error: 'Unauthorized. Missing anonymous ID.' });
  }

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: 'Confession cannot be empty.' });
  }

  const tweet = {
    id: Date.now(), // Better uniqueness
    text: text.trim(),
    tag: tag ? tag.trim().substring(0, 30) : null, // Clean tag input
    created_at: new Date().toISOString(),
    authorId: anonymousId
  };

  data.tweets.unshift(tweet);
  res.status(201).json({ message: 'Confession posted!', tweet });
});

//
// LIKE, COMMENT, BOOKMARK ROUTES
//
app.post('/api/tweets/:id/like', (req, res) => {
  const { id } = req.params;
  const { anonymousId } = req.body;
  if (!anonymousId) return res.status(401).json({ error: 'Unauthorized. Missing anonymous ID.' });
  if (!data.likes[id]) data.likes[id] = [];
  if (!data.likes[id].includes(anonymousId)) data.likes[id].push(anonymousId);
  res.json({ likes: data.likes[id].length });
});

app.post('/api/tweets/:id/comment', (req, res) => {
  const { id } = req.params;
  const { comment, anonymousId } = req.body;
  if (!anonymousId) return res.status(401).json({ error: 'Unauthorized. Missing anonymous ID.' });
  if (!comment || comment.trim() === "") return res.status(400).json({ error: 'Comment cannot be empty.' });
  if (!data.comments[id]) data.comments[id] = [];
  data.comments[id].push({ text: comment.trim(), authorId: anonymousId, date: new Date().toISOString() });
  res.json({ success: true });
});

app.post('/api/tweets/:id/bookmark', (req, res) => {
  const { id } = req.params;
  const { anonymousId } = req.body;
  if (!anonymousId) return res.status(401).json({ error: 'Unauthorized. Missing anonymous ID.' });
  if (!data.bookmarks[anonymousId]) data.bookmarks[anonymousId] = [];
  const index = data.bookmarks[anonymousId].indexOf(id);
  if (index === -1) data.bookmarks[anonymousId].push(id);
  else data.bookmarks[anonymousId].splice(index, 1);
  res.json({ bookmarked: index === -1 });
});

app.get('/api/bookmarks', (req, res) => {
  const anonymousId = req.anonymousId;
  if (!anonymousId) return res.status(401).json({ error: 'Unauthorized. Missing anonymous ID.' });
  const userBookmarks = data.bookmarks[anonymousId] || [];
  const bookmarkedTweets = userBookmarks.map(id => data.tweets.find(t => t.id == id)).filter(t => t);
  res.json({ data: bookmarkedTweets });
});

app.get('/api/profile/:anonymousId', (req, res) => {
  const { anonymousId } = req.params;
  if (!anonymousId || anonymousId.trim() === "") return res.status(401).json({ error: "Unauthorized: Not logged in." });
  const userTweets = data.tweets.filter(t => t.authorId === anonymousId);
  const receivedLikes = userTweets.reduce((sum, t) => sum + (data.likes[t.id]?.length || 0), 0);
  const givenLikes = Object.values(data.likes).filter(ids => ids.includes(anonymousId)).length;
  res.json({
    anonymousId,
    confessions: userTweets,
    receivedLikes,
    givenLikes,
    joinDate: new Date().toISOString().split('T')[0]
  });
});

app.get('/api/search', (req, res) => {
  const { query } = req.query;
  if (!query || query.trim() === "") return res.status(400).json({ error: 'Empty search query.' });
  const lowerQuery = query.toLowerCase();
  const results = data.tweets.filter(tweet =>
    tweet.text.toLowerCase().includes(lowerQuery) ||
    (tweet.tag && tweet.tag.toLowerCase().includes(lowerQuery))
  ).map(tweet => ({
    ...tweet,
    likes: data.likes[tweet.id]?.length || 0,
    comments: data.comments[tweet.id]?.length || 0
  }));
  res.json({ data: results });
});

app.get('/api/tags', (req, res) => {
  const tagCounts = {};
  data.tweets.forEach(tweet => {
    if (tweet.tag) tagCounts[tweet.tag] = (tagCounts[tweet.tag] || 0) + 1;
  });
  res.json({ tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]) });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});

