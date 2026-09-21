require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());


// ========================================
// Razorpay Configuration
// ========================================

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ========================================
// TEST API
// ========================================

app.get("/api/test", async (req, res) => {

    try {

        const [rows] =
            await db.query("SELECT 1 AS test");

        res.json({
            success: true,
            message: "Node.js + MySQL connection successful!",
            database: rows
        });

    } catch (error) {

        console.error("Database Error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });

    }

});


// ========================================
// CREATE RAZORPAY ORDER
// ========================================

app.post("/api/create-order", async (req, res) => {
    try {
        const { name, mobile, amount } = req.body;

        if (!name || !mobile || !amount || Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Name, mobile and valid amount are required"
            });
        }

        const donationAmount = Number(amount);
        const amountInPaise = Math.round(donationAmount * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: "donation_" + Date.now()
        };

        const order = await razorpay.orders.create(options);

        // IMPORTANT:
        // येथे MySQL मध्ये कोणतीही donation save होत नाही.
        // Payment successful झाल्यावरच save होईल.

        res.json({
            success: true,
            message: "Razorpay order created successfully",
            order: order
        });

    } catch (error) {
        console.error("Razorpay Order Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create Razorpay order",
            error: error.message
        });
    }
});


// ========================================
// VERIFY RAZORPAY PAYMENT
// ========================================

app.post("/api/verify-payment", async (req, res) => {
    try {
        const {
            name,
            mobile,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (
            !name ||
            !mobile ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment verification details missing"
            });
        }

        // Razorpay signature verify
        const generatedSignature =
            crypto
                .createHmac(
                    "sha256",
                    process.env.RAZORPAY_KEY_SECRET
                )
                .update(
                    razorpay_order_id + "|" + razorpay_payment_id
                )
                .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        // Razorpay कडून actual order details घेणे
        const order = await razorpay.orders.fetch(
            razorpay_order_id
        );

        const donationAmount = Number(order.amount) / 100;

        // Duplicate payment check
        const [existingDonation] = await db.query(
            `SELECT id
             FROM donations
             WHERE razorpay_payment_id = ?
                OR razorpay_order_id = ?
             LIMIT 1`,
            [
                razorpay_payment_id,
                razorpay_order_id
            ]
        );

        if (existingDonation.length > 0) {
            return res.json({
                success: true,
                message: "Payment already verified"
            });
        }

        // ONLY SUCCESSFUL PAYMENT is saved in MySQL
        await db.query(
            `INSERT INTO donations
            (
                transaction_id,
                razorpay_order_id,
                razorpay_payment_id,
                donor_name,
                mobile,
                amount,
                purpose,
                payment_method,
                payment_status,
                payment_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_payment_id,
                name,
                mobile,
                donationAmount,
                "गणेशोत्सव देणगी",
                "Razorpay",
                "SUCCESS"
            ]
        );

        res.json({
            success: true,
            message: "Payment verified and donation saved successfully"
        });

    } catch (error) {
        console.error(
            "Payment Verification Error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Payment verification failed",
            error: error.message
        });
    }
});


// ========================================
// ADMIN LOGIN
// ========================================

app.post("/api/admin/login", async (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;


        if (!username || !password) {

            return res.status(400).json({

                success: false,

                message:
                    "Username and password required"

            });

        }


        if (
            username !==
            process.env.ADMIN_USERNAME ||

            password !==
            process.env.ADMIN_PASSWORD
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Username किंवा password चुकीचा आहे"

            });

        }


        const token =
            jwt.sign(

                {
                    username: username,
                    role: "admin"
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: "8h"
                }

            );


        res.json({

            success: true,

            message:
                "Admin login successful",

            token: token

        });


    } catch (error) {

        console.error(
            "Admin Login Error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Login failed"

        });

    }

});


// ========================================
// ADMIN AUTH MIDDLEWARE
// ========================================

function verifyAdmin(req, res, next) {

    try {

        const authHeader =
            req.headers.authorization;


        if (!authHeader) {

            return res.status(401).json({

                success: false,

                message:
                    "Authorization required"

            });

        }


        const token =
            authHeader.split(" ")[1];


        if (!token) {

            return res.status(401).json({

                success: false,

                message:
                    "Token missing"

            });

        }


        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );


        if (decoded.role !== "admin") {

            return res.status(403).json({

                success: false,

                message:
                    "Admin access required"

            });

        }


        req.admin = decoded;

        next();


    } catch (error) {

        return res.status(401).json({

            success: false,

            message:
                "Session expired. Please login again."

        });

    }

}


// ========================================
// ADMIN DASHBOARD
// ========================================

app.get(
    "/api/admin/dashboard",
    verifyAdmin,
    async (req, res) => {

        try {

            // Total successful amount

            const [totalResult] =
                await db.query(

                    `SELECT
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN payment_status = 'SUCCESS'
                                    THEN amount
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS total_amount,

                        COUNT(
                            CASE
                                WHEN payment_status = 'SUCCESS'
                                THEN 1
                            END
                        ) AS success_count,

                        COUNT(
                            CASE
                                WHEN payment_status = 'PENDING'
                                THEN 1
                            END
                        ) AS pending_count,

                        COUNT(
                            CASE
                                WHEN payment_status = 'FAILED'
                                THEN 1
                            END
                        ) AS failed_count

                    FROM donations`

                );


            // All transactions

            const [transactions] =
                await db.query(

                    `SELECT
                        id,
                        transaction_id,
                        razorpay_order_id,
                        razorpay_payment_id,
                        donor_name,
                        mobile,
                        email,
                        amount,
                        purpose,
                        payment_method,
                        utr_number,
                        payment_status,
                        payment_date,
                        created_at

                     FROM donations

                     ORDER BY created_at DESC

                     LIMIT 100`

                );


            res.json({

                success: true,

                summary: {

                    total_amount:
                        Number(
                            totalResult[0].total_amount
                        ),

                    success_count:
                        Number(
                            totalResult[0].success_count
                        ),

                    pending_count:
                        Number(
                            totalResult[0].pending_count
                        ),

                    failed_count:
                        Number(
                            totalResult[0].failed_count
                        )

                },

                transactions:
                    transactions

            });


        } catch (error) {

            console.error(
                "Dashboard Error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Dashboard data load failed"

            });

        }

    }
);


// ========================================
// LOGOUT DOES NOT NEED BACKEND API
// ========================================

// ========================================
// DELETE DONATION - ADMIN ONLY
// ========================================

app.delete(
    "/api/admin/donation/:id",
    verifyAdmin,
    async (req, res) => {

        try {

            const { id } = req.params;

            if (!id || isNaN(Number(id))) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid donation ID"
                });
            }

            const [result] = await db.query(
                "DELETE FROM donations WHERE id = ?",
                [Number(id)]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Donation record सापडला नाही"
                });
            }

            res.json({
                success: true,
                message: "Donation successfully deleted"
            });

        } catch (error) {

            console.error("Delete Donation Error:", error);

            res.status(500).json({
                success: false,
                message: "Donation delete करता आली नाही",
                error: error.message
            });

        }

    }
);

// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Server running on port ${PORT}`
    );

});