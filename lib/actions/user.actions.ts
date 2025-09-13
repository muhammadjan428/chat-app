'use server';

import { auth } from '@clerk/nextjs/server';
import User, { IUser } from '../models/user.model';
import { connectToDB } from '../database';

interface UserData {
  clerkId: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  image?: string | null;
}


export const getAllUsers = async () => {
  try {
    await connectToDB();
    const users = await User.find().lean();
    return users;
  } catch (error) {
    console.error('[GET_ALL_USERS_ERROR]', error);
    return [];
  }
};

export const CreateUser = async (user: UserData) => {
  try {
    await connectToDB();

    const newUser = await User.create({ ...user });

    return JSON.parse(JSON.stringify(newUser));
  } catch (error) {
    console.error('Database error while creating user:', error);
    return new Response('Database error', { status: 500 });
  }
};

export const UpdateUser = async (clerkId: string, updates: Partial<UserData>) => {
  try {
    await connectToDB();
    const updatedUser = await User.findOneAndUpdate(
      { clerkId },
      updates,
      { new: true }
    );
    return JSON.parse(JSON.stringify(updatedUser));
  } catch (error) {
    console.error('Database error while updating user:', error);
    return new Response('Database error', { status: 500 });
  }
};

export const DeleteUser = async (clerkId: string) => {
  try {
    await connectToDB();
    const deletedUser = await User.findOneAndDelete({ clerkId });
    return JSON.parse(JSON.stringify(deletedUser));
  } catch (error) {
    console.error('Database error while deleting user:', error);
    return new Response('Database error', { status: 500 });
  }
};

export const getCurrentUser = async (): Promise<IUser | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  await connectToDB();
  const user = await User.findOne({ clerkId: userId }).lean<IUser>();

  return user || null;
};