const Groq = require("groq-sdk");
const logger = require('../utils/logger');

// Initialize Groq with API Key from environment variables
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY || 'YOUR_FREE_API_KEY' 
});

/**
 * Generates a professional reply to a customer review using Groq (Llama-3)
 * @param {string} customerReview - The text of the customer review
 * @param {string} businessName - The name of the business for context
 * @returns {Promise<string>} - The generated reply
 */
async function generateReviewReply(customerReview, businessName = 'our business') {
  try {
    if (!customerReview) {
      throw new Error('Customer review text is required');
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a helpful and professional business owner of "${businessName}". 
          Your task is to write a short, warm, and professional reply to a customer review. 
          Keep it concise (2-3 sentences max) and express genuine appreciation. 
          If the review is negative, be empathetic and offer to resolve the issue privately.`
        },
        { 
          role: "user", 
          content: customerReview 
        }
      ],
      model: "llama-3.3-70b-versatile",
    });

    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    logger.error('Error generating AI review reply:', error);
    throw new Error('Failed to generate AI reply. Please try again later.');
  }
}

/**
 * Analyzes a batch of reviews to provide insights and sentiment trends
 * @param {Array} reviews - Array of review objects { feedback, rating, submittedAt }
 * @param {string} businessName - The name of the business
 * @returns {Promise<string>} - The AI generated summary
 */
async function analyzeReviews(reviews, businessName) {
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'YOUR_FREE_API_KEY') {
      return null;
    }
    if (!reviews || reviews.length === 0) {
      return "Not enough reviews this week to generate a summary.";
    }

    const reviewsText = reviews.map(r => `[Rating: ${r.rating}/5] ${r.feedback}`).join('\n---\n');

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a strategic business consultant. Analyze the following reviews for "${businessName}" from the past week. 
          Provide a concise summary (max 200 words) that includes:
          1. Overall sentiment (Positive/Neutral/Negative).
          2. Top 3 recurring themes or issues.
          3. One actionable recommendation for the business owner.
          Be professional, direct, and constructive.`
        },
        { 
          role: "user", 
          content: `Here are the reviews:\n\n${reviewsText}`
        }
      ],
      model: "llama-3.3-70b-versatile",
    });

    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    logger.error('Error analyzing reviews:', error);
    return null;
  }
}

async function answerWithContext(reviews, question, businessName) {
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'YOUR_FREE_API_KEY') {
      return "AI is not configured on the server. Please contact support.";
    }
    const context = reviews.map(r => {
      const rating = r.rating != null ? `Rating: ${r.rating}/5` : 'Rating: N/A';
      const feedback = r.feedback || r.notes || r.comment || '';
      const date = r.submittedAt || r.createdAt || null;
      return `- ${rating}${date ? ` (${new Date(date).toISOString().split('T')[0]})` : ''} — ${feedback}`;
    }).join('\n');

    const systemPrompt = `You are an analyst helping "${businessName}". 
Use ONLY the provided customer feedback to answer the user's question. 
If the answer is not in the feedback, say you don't have enough information. Be concise and practical.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Feedback data:\n${context}\n\nQuestion: ${question}` }
      ],
      model: "llama-3.3-70b-versatile",
    });

    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    logger.error('Error answering with context:', error);
    throw new Error('Failed to generate AI answer.');
  }
}

async function improveFeedback(feedback, rating) {
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'YOUR_FREE_API_KEY') {
      throw new Error('AI is not configured');
    }
    const ratingNum = Number(rating);
    const original = String(feedback || '').trim();
    if (!original) {
      throw new Error('Feedback is required');
    }

    const toneInstruction =
      ratingNum >= 4
        ? 'Make it more enthusiastic and specific.'
        : 'Make it constructive and clear (not angry).';

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant improving customer feedback text. ' +
            'Fix grammar and spelling. Keep the core message. Keep it concise (max 200 words). ' +
            'Return ONLY the improved feedback text, no headings or extra formatting.'
        },
        {
          role: 'user',
          content:
            `Rating: ${ratingNum}/5\n` +
            `Instruction: ${toneInstruction}\n\n` +
            `Original feedback:\n${original}`
        }
      ],
      model: 'llama-3.3-70b-versatile'
    });

    const improved = chatCompletion.choices[0].message.content.trim();
    return improved;
  } catch (error) {
    logger.error('Error improving feedback:', error);
    throw new Error('Failed to improve feedback');
  }
}

module.exports = {
  generateReviewReply,
  analyzeReviews,
  answerWithContext,
  improveFeedback
};
