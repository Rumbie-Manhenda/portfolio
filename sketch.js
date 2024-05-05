// let vid = document.getElementById("background-video");
// vid.onload();
// vid.playbackRate = 0.1;

// let message = ()=>
//     {
//         alert(confirm, "Message sent!");
//     }

//     const express = require('express');
//     const bodyParser = require('body-parser');
//     const nodemailer = require('nodemailer');
    
//     const app = express();
//     const PORT = process.env.PORT || 3000;
    
//     // Body parser middleware
//     app.use(bodyParser.urlencoded({ extended: false }));
//     app.use(bodyParser.json());
    
//     // POST route to handle form submission
//     app.post('/send-email', (req, res) => {
//         const { email, message } = req.body;
    
//         // Create a transporter
//         const user_email = document.getElementById("user-email").value;
//         const my_email= 'pattymcharis15@gmail.com';
//         const transporter = nodemailer.createTransport({
//             service: 'gmail', 
//             auth: {
//                 user: user_email,
//                 pass: "<PASSWORD>"
//             }
//         });
    
//         // Email content
//         const mailOptions = {
//             from: user_email,
//             to: my_email,
//             subject: 'New Message from Contact Form',
//             text: `Email: ${email}\nMessage: ${message}`
//         };
    
//         // Send email
//         transporter.sendMail(mailOptions, (error, info) => {
//             if (error) {
//                 console.log(error);
//                 res.status(500).send('Error sending email');
//             } else {
//                 console.log('Email sent: ' + info.response);
//                 res.status(200).send('Email sent successfully');
//             }
//         });
//     });
    
//     // Start the server
//     app.listen(PORT, () => {
//         console.log(`Server is running on port ${PORT}`);
//     });
    