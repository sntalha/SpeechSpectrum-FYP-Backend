import { orderModel } from "../models/order.schema.js";
import { productModel } from "../models/products.schema.js";

export default class Orders {
    static async create(req, res) {
        const { products, paymentMethod } = req.body;

        try{    

          if(!products || !paymentMethod){
            return res.status(400).json({message: "All fields are required", status: "failed"});
          }

          let totalAmount = 0;

          for (const item of products) {

              const product = await productModel.findById(item.id)
              if(!product){
                    return res.status(404).json({message: "Product not found", status: "failed"});
                }

                totalAmount += product.price * item.quantity;
          };
          
          const newOrder = new orderModel({
            userId: req.user._id,
            products,
            paymentMethod,
            totalAmount,
          })

          await newOrder.save();
          res.status(201).json({message: "Order created successfully", status: "success", data: newOrder});

        }catch(error){
            res.status(500).json({message: "Internal server error", status: "failed"});
        }
    }

    static async handleStatusByAdmin(req, res) {
        try{
            const {status, orderId} = req.body;

            if(!status, !orderId){
                return res.status(400).json({message: "All field is required", status: "failed"});
            }
            const order = await orderModel.findByIdAndUpdate(orderId, {status}, {new: true})
            if(!order){
                return res.status(404).json({message: "Order not found", status: "failed"});
            }

            res.status(200).json({message: "Order status updated successfully", status: "success", data: order});

        }catch(error){
            res.status(500).json({message: "Internal server error", status: "failed"});
        }
    }

    static async getOrders(req,res) {
        try {
            let user = req.user;
            let {status} = req.query;   

            let filter = {};
            
            if(user.role == "user"){
                filter.userId = user._id
            }

            if(status){
                filter.status = status;
            }
            
            const orders = await orderModel.find(filter);

            res.status(200).json({message: "Orders fetched successfully", status: "success", data: orders});

        } catch (error) {
            res.status(500).json({message: "Internal server error", status: "failed"});
        }
    }
}
