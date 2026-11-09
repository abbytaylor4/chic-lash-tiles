
const PRODUCTS = [
  ["Polka-Dot Character", 4],
  ["Pink Character", 3],
  ["Iced Coffee Character", 3],
  ["Pink Bow Girl", 3],
  ["Pink & Brown Polka Dot", 4],
  ["Pink Zebra", 3],
  ["Silver Glitter Stars", 3],
  ["Neutral Polka Dots", 3],
  ["Pink Lace", 3],
  ["Chic Girl", 3],
  ["Neutral Zebra", 3],
  ["Pink Croissant", 2],
  ["C’est La Vie", 3]
];

const reply = (statusCode, data) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "POST required." });
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const location = process.env.SQUARE_LOCATION_ID;

  if (!token || !location) {
    return reply(503, {
      error: "Square connection is not configured."
    });
  }

  let cart;
  try {
    cart = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid cart." });
  }

  if (
    !Array.isArray(cart.items) ||
    !cart.items.length ||
    cart.items.length > PRODUCTS.length ||
    !["shipping", "pickup"].includes(cart.delivery)
  ) {
    return reply(400, { error: "Invalid checkout details." });
  }

  const seen = new Set();
  const items = [];

  for (const item of cart.items) {
    if (
      !item ||
      !Number.isInteger(item.id) ||
      !Number.isInteger(item.quantity) ||
      item.id < 0 ||
      item.id >= PRODUCTS.length ||
      item.quantity < 1 ||
      item.quantity > PRODUCTS[item.id][1] ||
      seen.has(item.id)
    ) {
      return reply(400, { error: "Invalid product quantity." });
    }

    seen.add(item.id);
    items.push({
      name: "CHIC Lash Tile - " + PRODUCTS[item.id][0],
      quantity: String(item.quantity),
      base_price_money: {
        amount: 1200,
        currency: "USD"
      }
    });
  }


  const subtotal = cart.items.reduce(
    (total, item) => total + item.quantity * 12, 0
  );

  if (cart.delivery === "shipping" && subtotal <= 30) {
    items.push({
      name: "Flat-rate shipping",
      quantity: "1",
      base_price_money: {
        amount: 700,
        currency: "USD"
      }
    });
  }

  const request = {
    idempotency_key: require("crypto").randomUUID(),
    order: {
      location_id: location,
      line_items: items
    },
    checkout_options: {
      ask_for_shipping_address: cart.delivery === "shipping",
      allow_tipping: false
    },
    payment_note: cart.delivery === "pickup"
      ? "CHIC: Free local pickup in Salt Lake City, Utah."
      : subtotal > 30
        ? "CHIC: Free shipping on orders over $30."
        : "CHIC: $7 flat-rate shipping."
  };

    },    },
    payment_note: cart.delivery === "pickup"
      ? "CHIC: Free local pickup in Salt Lake City, Utah."
     : subtotal > 30
  ? "CHIC: Free shipping on orders over $30."
  : "CHIC: $7 flat-rate shipping."
  try {
    const response = await fetch(
      "https://connect.squareup.com/v2/online-checkout/payment-links",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json",
          "Square-Version": "2026-09-16"
        },
        body: JSON.stringify(request)
      }
    );

    const result = await response.json();

    if (!response.ok || !result.payment_link?.url) {
      console.error("Square error:", result.errors);
      return reply(502, {
        error: "Square could not create checkout."
      });
    }

    return reply(200, {
      url: result.payment_link.url
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return reply(502, {
      error: "Unable to connect to Square."
    });
  }
};
