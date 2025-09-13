import { Schema, model, models, Document } from 'mongoose';

export interface IUser extends Document {
  clerkId: string;
  email: string;
  first_name: string;
  last_name: string;
  image?: string;
  isAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  clerkId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  image: String,
  isAdmin: { type: Boolean, default: false },
}, { 
  timestamps: true // This automatically adds createdAt and updatedAt
});

const User = models.User || model<IUser>('User', UserSchema);
export default User;