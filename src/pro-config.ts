/** Everything the owner may want to change about Versa Pro lives here (prices are proposals). */
export const plans = [
  { id: 'individual', name: ['Individual', 'Individual'], price: 1200, devices: ['1 computador', '1 computer'] },
  { id: 'school', name: ['Escola', 'School'], price: 6000, devices: ['até 10 computadores', 'up to 10 computers'] },
] as const
/** How to pay and receive a key. Leave empty until the numbers and contact are decided; the page then says "to be confirmed". */
export const payment = { mpesa: '', emola: '', contact: '' }
