// Minimal type declarations for react-native-razorpay (the package ships none).
// Covers only the fields we use in lib/paymentService.ts.

declare module 'react-native-razorpay' {
  export interface CheckoutOptions {
    key: string;
    order_id: string;
    amount: number | string;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    theme?: { color?: string };
    prefill?: { contact?: string; email?: string; name?: string };
    notes?: Record<string, string>;
  }

  export interface CheckoutSuccess {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }

  export interface CheckoutError {
    code?: number;
    description?: string;
    error?: { code?: string; description?: string };
  }

  const RazorpayCheckout: {
    open(options: CheckoutOptions): Promise<CheckoutSuccess>;
  };

  export default RazorpayCheckout;
}
