import bodyParser from "body-parser";
import dotenv from "dotenv";
import express from "express";
import { resolve } from "path";
import Stripe from "stripe";

const app = express();

dotenv.config({ path: "./.env" });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 4242;

// Setup useful middleware.
app.use(
  bodyParser.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify(req, res, buf) {
      if ((req as any).originalUrl.startsWith("/webhook")) {
        (req as any).rawBody = buf.toString();
      }
    }
  })
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});
app.use(express.static("../../client"));
app.use(express.json());

// Render the checkout page
app.get("/", (req, res) => {
  const path = resolve("./client/index.html");
  res.sendFile(path);
});

app.get("/public-key", (req, res) => {
  res.send({ publicKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

const calculateOrderAmount = () => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1999;
};

app.post("/payment_intents", async (req, res) => {
  const { currency } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: calculateOrderAmount(),
      currency
    });
    return res.status(200).json(paymentIntent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// A webhook to receive events sent from Stripe
// You can listen for specific events
// This webhook endpoint is listening for a payment_intent.succeeded event
app.post("/webhook", async (req, res) => {
  let data;
  let eventType;
  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;

    let signature = req.headers["stripe-signature"];

    signature = Array.isArray(signature) ? signature[0] : signature;

    try {
      event = stripe.webhooks.constructEvent(
        (req as any).rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      // tslint:disable-next-line:no-console
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "payment_intent.succeeded") {
    // tslint:disable-next-line:no-console
    console.log("💰Your user provided payment details!");
    // Fulfill any orders or e-mail receipts
    res.sendStatus(200);
  }
});

// tslint:disable-next-line:no-console
app.listen(port, () => console.log(`Listening on port ${port}`));
