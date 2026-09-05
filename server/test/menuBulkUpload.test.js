const test = require("node:test");
const assert = require("node:assert/strict");
const menuController = require("../controllers/menuController");

// Test with mock req/res to verify controller error handling and parsing
test("validateMenuCsv handles standard comma CSV with mixed casing and prices", async () => {
  const csvData = Buffer.from(`Name,Price,Category,Description,Type,Image,isSpecial,isAvailable
House Espresso,₹ 180/-,Hot Coffee,Single origin shot,Veg,https://example.com/espresso.jpg,false,true
Chicken Sandwich,Rs. 250.00,Snacks,Grilled sandwich,Non-Veg,https://example.com/sandwich.jpg,true,true
`);

  let responseStatus = 200;
  let responseData = null;

  const req = {
    user: { role: "cafe_admin", cafeId: "507f1f77bcf86cd799439011" },
    file: { buffer: csvData },
  };

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await menuController.previewMenuCsv(req, res);

  assert.equal(responseStatus, 200);
  assert.equal(responseData.total, 2);
  assert.equal(responseData.preview[0].name, "House Espresso");
  assert.equal(responseData.preview[0].price, 180);
  assert.equal(responseData.preview[0].type, "veg");
  assert.equal(responseData.preview[1].name, "Chicken Sandwich");
  assert.equal(responseData.preview[1].price, 250);
  assert.equal(responseData.preview[1].type, "non-veg");
  assert.equal(responseData.preview[1].isSpecial, true);
});

test("validateMenuCsv handles UTF-8 BOM, semicolon delimiter, and custom aliases", async () => {
  const csvData = Buffer.from(`\uFEFFItem Name;Rate;Category;Veg / Non-Veg;Image URL
Cold Coffee;150;Cold Beverages;Veg;https://example.com/cc.jpg
Paneer Tikka Roll;190;Snacks;Veg;https://example.com/roll.jpg
`);

  let responseStatus = 200;
  let responseData = null;

  const req = {
    user: { role: "super_admin" },
    body: { cafeId: "507f1f77bcf86cd799439011" },
    file: { buffer: csvData },
  };

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await menuController.previewMenuCsv(req, res);

  assert.equal(responseStatus, 200);
  assert.equal(responseData.total, 2);
  assert.equal(responseData.preview[0].name, "Cold Coffee");
  assert.equal(responseData.preview[0].price, 150);
  assert.equal(responseData.preview[1].name, "Paneer Tikka Roll");
  assert.equal(responseData.preview[1].price, 190);
});

test("previewMenuCsv returns 400 when cafeId is missing or invalid", async () => {
  let responseStatus = 200;
  let responseData = null;

  const req = {
    user: { role: "super_admin" },
    body: {},
    file: { buffer: Buffer.from("name,price\nTea,50") },
  };

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await menuController.previewMenuCsv(req, res);

  assert.equal(responseStatus, 400);
  assert.match(responseData.message, /cafeId is required/i);
});

test("previewMenuCsv returns 400 with row errors when items have missing fields", async () => {
  const csvData = Buffer.from(`name,price
,100
Invalid Price Item,abc
`);

  let responseStatus = 200;
  let responseData = null;

  const req = {
    user: { role: "cafe_admin", cafeId: "507f1f77bcf86cd799439011" },
    file: { buffer: csvData },
  };

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await menuController.previewMenuCsv(req, res);

  assert.equal(responseStatus, 200);
  assert.equal(responseData.total, 0);
  assert.equal(responseData.errors.length, 2);
  assert.match(responseData.errors[0].message, /Missing item name/i);
  assert.match(responseData.errors[1].message, /Invalid price/i);
});
