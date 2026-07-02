const GITHUB_OWNER = 'WorkFloMon';
const GITHUB_REPO = 'floating-willow';
const REVIEWS_PATH = 'data/reviews.json';

function githubHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function fetchReviewsFromGitHub(token) {
  const res = await fetch(
    'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + REVIEWS_PATH,
    { headers: githubHeaders(token) }
  );

  if (res.status === 404) return [];
  if (!res.ok) throw new Error('Failed to load reviews');

  const file = await res.json();
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
}

async function fetchReviewsPublic() {
  const res = await fetch(
    'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/main/' + REVIEWS_PATH
  );
  if (!res.ok) return [];
  return res.json();
}

function validateReview(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body';

  var name = String(body.name || '').trim();
  var text = String(body.text || '').trim();
  var rating = Number(body.rating);

  if (name.length < 1 || name.length > 80) return 'Name is required (max 80 characters).';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Please select a rating from 1 to 5 stars.';
  if (text.length < 10 || text.length > 500) return 'Review must be between 10 and 500 characters.';

  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      var token = process.env.GITHUB_TOKEN;
      var reviews = token
        ? await fetchReviewsFromGitHub(token)
        : await fetchReviewsPublic();
      return res.status(200).json(reviews);
    } catch (err) {
      return res.status(200).json([]);
    }
  }

  if (req.method === 'POST') {
    var token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(503).json({ error: 'Review submission is not configured yet.' });
    }

    var error = validateReview(req.body);
    if (error) {
      return res.status(400).json({ error: error });
    }

    try {
      var fileRes = await fetch(
        'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + REVIEWS_PATH,
        { headers: githubHeaders(token) }
      );

      if (!fileRes.ok) {
        return res.status(500).json({ error: 'Could not read reviews file.' });
      }

      var file = await fileRes.json();
      var reviews = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));

      var newReview = {
        id: String(Date.now()),
        name: String(req.body.name).trim(),
        rating: Number(req.body.rating),
        text: String(req.body.text).trim(),
        date: new Date().toISOString().slice(0, 10),
      };

      reviews.unshift(newReview);

      var putRes = await fetch(
        'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + REVIEWS_PATH,
        {
          method: 'PUT',
          headers: githubHeaders(token),
          body: JSON.stringify({
            message: 'Add customer review from ' + newReview.name,
            content: Buffer.from(JSON.stringify(reviews, null, 2) + '\n').toString('base64'),
            sha: file.sha,
            branch: 'main',
          }),
        }
      );

      if (!putRes.ok) {
        return res.status(500).json({ error: 'Could not save review. Please try again.' });
      }

      return res.status(201).json(newReview);
    } catch (err) {
      return res.status(500).json({ error: 'Could not save review. Please try again.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
