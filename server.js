require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

const auth = Buffer.from(`${process.env.SHOP_ID}:${process.env.SECRET_KEY}`).toString('base64');
const orders = new Map();

async function createYooKassaPayment(amount, description, orderId, returnUrl) {
    const idempotenceKey = uuidv4();
    const paymentData = {
        amount: { value: amount.toFixed(2), currency: 'RUB' },
        payment_method_data: { type: 'bank_card' },
        confirmation: { type: 'redirect', return_url: returnUrl },
        // 注意：不要添加 capture 参数！你的账户不支持两阶段支付
        description: description,
        metadata: { orderId: orderId }
    };
    
    console.log('Sending payment request...');
    
    try {
        const response = await axios({
            method: 'post',
            url: `${process.env.YOKASSA_API_URL}/payments`,
            headers: {
                'Content-Type': 'application/json',
                'Idempotence-Key': idempotenceKey,
                'Authorization': `Basic ${auth}`
            },
            data: paymentData
        });
        console.log('Payment created successfully!');
        return response.data;
    } catch (error) {
        console.error('YooKassa API Error:', error.response?.data || error.message);
        throw error;
    }
}

async function getPaymentStatus(paymentId) {
    try {
        const response = await axios({
            method: 'get',
            url: `${process.env.YOKASSA_API_URL}/payments/${paymentId}`,
            headers: { 'Authorization': `Basic ${auth}` }
        });
        return response.data;
    } catch (error) {
        console.error('Get Payment Status Error:', error.response?.data || error.message);
        throw error;
    }
}

app.post('/api/create-payment', async (req, res) => {
    const { amount, description, orderId } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const finalOrderId = orderId || uuidv4();
    const returnUrl = `${process.env.SITE_URL}/payment-result.html`;
    try {
        const payment = await createYooKassaPayment(parseFloat(amount), description, finalOrderId, returnUrl);
        orders.set(finalOrderId, {
            orderId: finalOrderId,
            paymentId: payment.id,
            amount: parseFloat(amount),
            description: description,
            status: payment.status,
            createdAt: new Date().toISOString(),
            confirmationUrl: payment.confirmation.confirmation_url
        });
        res.json({ success: true, orderId: finalOrderId, paymentId: payment.id, confirmationUrl: payment.confirmation.confirmation_url });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create payment', details: error.message });
    }
});

app.get('/api/order-status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const localOrder = orders.get(orderId);
    if (!localOrder) return res.status(404).json({ error: 'Order not found' });
    try {
        const paymentStatus = await getPaymentStatus(localOrder.paymentId);
        localOrder.status = paymentStatus.status;
        orders.set(orderId, localOrder);
        res.json({ orderId: orderId, status: paymentStatus.status, paid: paymentStatus.status === 'succeeded', amount: localOrder.amount });
    } catch (error) {
        res.json({ orderId: orderId, status: localOrder.status, paid: localOrder.status === 'succeeded', warning: 'Status from local cache' });
    }
});

app.post('/webhook', async (req, res) => {
    const event = req.body;
    console.log('Webhook received:', JSON.stringify(event, null, 2));
    if (event.object && event.object.status === 'succeeded') {
        const orderId = event.object.metadata?.orderId;
        if (orderId && orders.has(orderId)) {
            const order = orders.get(orderId);
            order.status = 'succeeded';
            orders.set(orderId, order);
            console.log(`Payment succeeded for order ${orderId}`);
        }
    }
    res.status(200).json({ received: true });
});

app.get('/api/services', (req, res) => {
    res.json([
        { id: 'consultation', name: 'Приём терапевта', price: 3150 },
        { id: 'ultrasound', name: 'УЗИ брюшной полости', price: 4500 },
        { id: 'xray', name: 'Рентген (1 проекция)', price: 1700 },
        { id: 'blood-test', name: 'Общий анализ крови', price: 2000 },
        { id: 'castration', name: 'Кастрация кота', price: 11000 },
        { id: 'vaccination', name: 'Вакцинация', price: 4500 }
    ]);
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), ordersCount: orders.size });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/payment-result.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'payment-result.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`YooKassa API: ${process.env.YOKASSA_API_URL}`);
});