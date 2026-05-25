const axios = require('axios');

const SHOP_ID =1367413; 
const SECRET_KEY = 'test_UUO-4uzT5JXkpcWS-A2rEp0OUp3ccY6sB5CSHjuBDr8';
const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

async function test() {
    try {
        const response = await axios({
            method: 'post',
            url: 'https://api.yookassa.ru/v3/payments',
            headers: {
                'Content-Type': 'application/json',
                'Idempotence-Key': 'test-' + Date.now(),
                'Authorization': `Basic ${auth}`
            },
            data: {
                amount: { value: '100.00', currency: 'RUB' },
                payment_method_data: { type: 'bank_card' },
                confirmation: { type: 'redirect', return_url: 'https://example.com' },
                description: '���֧���ӧ��� ��ݧѧ�֧�'
            }
        });
        console.log('? �ɹ�!');
        console.log('֧������:', response.data.confirmation.confirmation_url);
    } catch (error) {
        console.log('? ʧ��!');
        console.log('������:', error.response?.data?.code);
        console.log('������Ϣ:', error.response?.data?.description);
        console.log('������Ӧ:', JSON.stringify(error.response?.data, null, 2));
    }
}

test();